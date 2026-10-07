import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RuleTester } from "eslint";
import markdown from "@eslint/markdown";
import rule from "./no-stale-spec-links.mjs";

const MATHS_TEST = [
  'describe("maths", () => {',
  '  it("adds numbers", () => {',
  "    expect(1 + 1).toBe(2);",
  "  });",
  '  it("subtracts numbers", () => {',
  "    expect(2 - 1).toBe(1);",
  "  });",
  "});",
  "",
].join("\n");

const HEADER = "// header\n// header\n// header\n";

const spec = (...links) =>
  ["# Maths", "", ...links.flatMap((link) => [link, ""])].join("\n");

const link = (label, target, line) => `([${label}](${target}#L${line}))`;
const titled = (title, target, line) =>
  link(`validated by ${title}`, target, line);

const repo = mkdtempSync(join(tmpdir(), "no-stale-spec-links-"));
const outsideRepo = mkdtempSync(join(tmpdir(), "no-stale-spec-links-bare-"));

process.on("exit", () => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(outsideRepo, { recursive: true, force: true });
});

const git = (...args) =>
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
const write = (path, content) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};

git("init", "-q", "-b", "main");
for (const [key, value] of [
  ["user.email", "test@example.test"],
  ["user.name", "Test"],
  ["commit.gpgsign", "false"],
  ["core.excludesFile", "/dev/null"],
]) {
  git("config", key, value);
}

// Each document is committed as the base copy of the very text the case lints.
const committedSpec = (name, content) => {
  write(`specs/${name}/spec.md`, content);

  return { code: content, filename: join(repo, `specs/${name}/spec.md`) };
};

const MATHS = "tests/maths.test.ts";
const UNTOUCHED = "tests/untouched.test.ts";

const upToDate = committedSpec(
  "up-to-date",
  spec(titled("adds numbers", UNTOUCHED, 2)),
);
const unchangedFileStale = committedSpec(
  "unchanged-stale",
  spec(titled("adds numbers", UNTOUCHED, 1)),
);
const unchangedFileSwept = committedSpec(
  "unchanged-swept",
  spec(titled("adds numbers", UNTOUCHED, 1)),
);
const moved = committedSpec(
  "moved",
  spec(titled("adds numbers", MATHS, 2), titled("subtracts numbers", MATHS, 5)),
);
const movedOneLine = committedSpec(
  "moved-one-line",
  `# Maths\n\nBoth: ${titled("adds numbers", MATHS, 2)}, ${titled("subtracts numbers", MATHS, 5)}\n`,
);
const bareLabel = committedSpec("bare-label", spec(link("L2", MATHS, 2)));

write(MATHS, MATHS_TEST);
write(UNTOUCHED, MATHS_TEST);
git("add", "-A");
git("commit", "-q", "-m", "base");
// The branch under test inserts a header above every test in maths.test.ts.
write(MATHS, HEADER + MATHS_TEST);

const withBase = { baseRef: "main" };
const ruleTester = new RuleTester({
  plugins: { markdown },
  language: "markdown/gfm",
});

ruleTester.run("no-stale-spec-links", rule, {
  valid: [
    // the cited test did not move
    { ...upToDate, options: [withBase] },
    // the branch left the cited file alone, so its links are out of scope ...
    { ...unchangedFileStale, options: [withBase] },
    // ... and with no merge base there is nothing to compare against
    { ...moved, options: [{ baseRef: "no-such-ref" }] },
    // a document outside any git work tree
    {
      code: moved.code,
      filename: join(outsideRepo, "specs/moved/spec.md"),
      options: [withBase],
    },
  ],
  invalid: [
    {
      ...moved,
      options: [withBase],
      errors: [
        {
          messageId: "staleLink",
          line: 3,
          data: { moved: `${MATHS}#L2 -> #L5` },
        },
        {
          messageId: "staleLink",
          line: 5,
          data: { moved: `${MATHS}#L5 -> #L8` },
        },
      ],
      output: spec(
        titled("adds numbers", MATHS, 5),
        titled("subtracts numbers", MATHS, 8),
      ),
    },
    {
      // two links on one line are one report
      ...movedOneLine,
      options: [withBase],
      errors: [
        {
          messageId: "staleLink",
          line: 3,
          data: { moved: `${MATHS}#L2 -> #L5, ${MATHS}#L5 -> #L8` },
        },
      ],
      output: `# Maths\n\nBoth: ${titled("adds numbers", MATHS, 5)}, ${titled("subtracts numbers", MATHS, 8)}\n`,
    },
    {
      // a bare Lnn label follows its href
      ...bareLabel,
      options: [withBase],
      errors: [{ messageId: "staleLink", line: 3 }],
      output: spec(link("L5", MATHS, 5)),
    },
    {
      // `all` sweeps links into files the branch did not change
      ...unchangedFileSwept,
      options: [{ ...withBase, all: true }],
      errors: [
        {
          messageId: "staleLink",
          line: 3,
          data: { moved: `${UNTOUCHED}#L1 -> #L2` },
        },
      ],
      output: spec(titled("adds numbers", UNTOUCHED, 2)),
    },
  ],
});
