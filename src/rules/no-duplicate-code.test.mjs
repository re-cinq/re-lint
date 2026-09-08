import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-duplicate-code.mjs";
import { resolveJscpdBin } from "./lib/jscpd/runner.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const fixtureDir = join(repoRoot, "test-fixtures", "no-duplicate-code");
const realBin = join(repoRoot, "node_modules", "jscpd", "run-jscpd.js");

// The fixture is copied out of test-fixtures so the scan sees only
// a.ts/b.ts/c.ts and the invalidation case can rewrite b.ts without touching
// the checkout. A copy under node_modules/.cache still has the repo's
// node_modules above it, so the walk-up bin resolution is what finds jscpd;
// a copy under the OS tmpdir has nothing above it and needs `jscpdBin`.
const cacheRoot = join(repoRoot, "node_modules", ".cache");

function copyFixture(parent) {
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "no-duplicate-code-"));
  cpSync(fixtureDir, dir, { recursive: true });
  return dir;
}

function lint(cwd, options) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tsParser, sourceType: "module" },
        plugins: { "re-lint": { rules: { "no-duplicate-code": rule } } },
        rules: { "re-lint/no-duplicate-code": ["error", options] },
      },
    ],
  });
  return eslint.lintFiles(["."]);
}

function summarize(results) {
  return Object.fromEntries(
    results.map((result) => [
      basename(result.filePath),
      result.messages.map(({ messageId, line, endLine, message }) => ({
        messageId,
        line,
        endLine,
        message,
      })),
    ]),
  );
}

test("resolveJscpdBin walks up from a nested dir with no package.json to the repo's node_modules/jscpd", () => {
  assert.equal(resolveJscpdBin(fixtureDir, undefined), realBin);
});

test("resolveJscpdBin returns /nonexistent/run-jscpd.js verbatim when given as override", () => {
  assert.equal(
    resolveJscpdBin(fixtureDir, "/nonexistent/run-jscpd.js"),
    "/nonexistent/run-jscpd.js",
  );
});

test("resolveJscpdBin returns null from a dir with no jscpd anywhere above it", () => {
  assert.equal(
    resolveJscpdBin(mkdtempSync(join(tmpdir(), "no-jscpd-")), undefined),
    null,
  );
});

test("a.ts and b.ts each get one duplicate message spanning the shared block; c.ts gets none", async () => {
  const cwd = copyFixture(cacheRoot);
  const results = await lint(cwd, { minTokens: 30, roots: ["."] });
  const byFile = summarize(results);

  assert.deepEqual(byFile, {
    "a.ts": [
      {
        messageId: "duplicate",
        line: 2,
        endLine: 67,
        message: "66 lines (330 tokens) duplicated with b.ts:10-75",
      },
    ],
    "b.ts": [
      {
        messageId: "duplicate",
        line: 10,
        endLine: 75,
        message: "66 lines (330 tokens) duplicated with a.ts:2-67",
      },
    ],
    "c.ts": [],
  });
  rmSync(cwd, { recursive: true, force: true });
});

test("jscpdBin pointing at the real run-jscpd.js finds the same a.ts/b.ts clone from a tmpdir with no node_modules above it", async () => {
  const cwd = copyFixture(tmpdir());
  const results = await lint(cwd, { minTokens: 30, jscpdBin: realBin });

  assert.deepEqual(summarize(results), {
    "a.ts": [
      {
        messageId: "duplicate",
        line: 2,
        endLine: 67,
        message: "66 lines (330 tokens) duplicated with b.ts:10-75",
      },
    ],
    "b.ts": [
      {
        messageId: "duplicate",
        line: 10,
        endLine: 75,
        message: "66 lines (330 tokens) duplicated with a.ts:2-67",
      },
    ],
    "c.ts": [],
  });
  rmSync(cwd, { recursive: true, force: true });
});

test("jscpdBin /nonexistent yields exactly one unavailable message across a.ts, b.ts and c.ts", async () => {
  const cwd = copyFixture(tmpdir());
  const results = await lint(cwd, { jscpdBin: "/nonexistent" });
  const all = results.flatMap((result) => result.messages);

  assert.equal(all.length, 1);
  assert.match(
    all[0].message,
    /jscpd could not run \(jscpd binary not found at \/nonexistent\)/,
  );
  assert.match(all[0].message, /npm i -D jscpd/);
  assert.equal(all[0].messageId, "unavailable");
  rmSync(cwd, { recursive: true, force: true });
});

test("roots naming a glob that is no directory yields one unavailable message naming the root", async () => {
  const cwd = copyFixture(cacheRoot);
  const results = await lint(cwd, { minTokens: 30, roots: ["src/*"] });
  const all = results.flatMap((result) => result.messages);

  assert.equal(all.length, 1);
  assert.match(all[0].message, /root src\/\* not found .* not globs/);
});

test('formats: ["tsx"] skips the .ts fixture clone entirely', async () => {
  const cwd = copyFixture(cacheRoot);
  const results = await lint(cwd, { minTokens: 30, formats: ["tsx"] });

  assert.deepEqual(
    results.flatMap((result) => result.messages),
    [],
  );
});

test("rewriting b.ts without the clone after a scan in the same process yields zero messages", async () => {
  const cwd = copyFixture(cacheRoot);
  const options = { minTokens: 30, roots: ["."] };
  const before = await lint(cwd, options);
  assert.equal(before.flatMap((result) => result.messages).length, 2);

  const cleanB = readFileSync(join(cwd, "b.ts"), "utf8").split(
    "export function sumWidths",
  )[0];
  writeFileSync(join(cwd, "b.ts"), cleanB);
  const future = new Date(Date.now() + 5000);
  utimesSync(join(cwd, "b.ts"), future, future);

  const after = await lint(cwd, options);
  assert.deepEqual(summarize(after), { "a.ts": [], "b.ts": [], "c.ts": [] });
  rmSync(cwd, { recursive: true, force: true });
});
