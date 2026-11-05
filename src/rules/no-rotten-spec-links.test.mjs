import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RuleTester } from "eslint";
import markdown from "@eslint/markdown";
import { anchorHashOf } from "#spec/anchor-hash.js";
import rule from "./no-rotten-spec-links.mjs";

const ADDS = '  it("adds numbers", () => {';
const MATHS_TEST = [
  'describe("maths", () => {',
  ADDS,
  "    expect(1 + 1).toBe(2);",
  "  });",
  "});",
  "",
].join("\n");
const MATHS = "tests/maths.test.ts";
const GONE = "tests/gone.test.ts";

const repo = mkdtempSync(join(tmpdir(), "no-rotten-spec-links-"));

process.on("exit", () => rmSync(repo, { recursive: true, force: true }));

const git = (...args) =>
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
const write = (path, content) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};
const committedSpec = (name, content) => {
  write(`specs/${name}/spec.md`, content);

  return { code: content, filename: join(repo, `specs/${name}/spec.md`) };
};
const hashedLink = (target, line) =>
  `# Maths\n\nAdds. ([validated by @${anchorHashOf(ADDS)}](${target}#L${line}))\n`;

git("init", "-q", "-b", "main");
for (const [key, value] of [
  ["user.email", "test@example.test"],
  ["user.name", "Test"],
  ["commit.gpgsign", "false"],
  ["core.excludesFile", "/dev/null"],
]) {
  git("config", key, value);
}

const moved = committedSpec("moved", hashedLink(MATHS, 2));
const rewritten = committedSpec("rewritten", hashedLink(GONE, 2));

write(MATHS, MATHS_TEST);
write(GONE, MATHS_TEST);
git("add", "-A");
git("commit", "-q", "-m", "base");
// The branch moves the test in maths.test.ts and rewrites the one in gone.test.ts beyond recognition.
write(MATHS, `// header\n// header\n${MATHS_TEST}`);
write(GONE, MATHS_TEST.replace("adds numbers", "parses config files"));

const withBase = { baseRef: "main" };

new RuleTester({ plugins: { markdown }, language: "markdown/gfm" }).run(
  "no-rotten-spec-links",
  rule,
  {
    valid: [
      // a link its hash still leads to is a warning for no-stale-spec-links, not an error here
      { ...moved, options: [withBase] },
    ],
    invalid: [
      {
        ...rewritten,
        options: [withBase],
        errors: [{ messageId: "rottenLink", line: 3 }],
      },
    ],
  },
);
