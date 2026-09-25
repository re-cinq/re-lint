import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "reanchor.mjs");

const run = (repo, ...args) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const git = (repo, ...args) => {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
};

const initRepo = (repo) => {
  git(repo, "init", "-q", "-b", "main");

  for (const [key, value] of [
    ["user.email", "test@example.test"],
    ["user.name", "Test"],
    ["commit.gpgsign", "false"],
    ["core.excludesFile", "/dev/null"],
    ["gc.auto", "0"],
  ]) {
    git(repo, "config", key, value);
  }

  return repo;
};

const write = (repo, path, content) => {
  mkdirSync(join(repo, dirname(path)), { recursive: true });
  writeFileSync(join(repo, path), content);
};

const read = (repo, path) => readFileSync(join(repo, path), "utf8");

const asFile = (lines) => `${lines.join("\n")}\n`;

const assertUsageError = (result) => {
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage:/);
};

const MATHS_TEST = [
  'describe("maths", () => {',
  '  it("adds numbers", () => {',
  "    expect(1 + 1).toBe(2);",
  "  });",
  '  it("subtracts numbers", () => {',
  "    expect(2 - 1).toBe(1);",
  "  });",
  "});",
];

const TEST_PATH = "tests/Maths.test.ts";
const SPEC_PATH = "specs/maths/spec.md";
const INTRO = [
  'import { describe } from "vitest";',
  'import { add } from "./add.js";',
];

const link = (label, anchor) =>
  `[${label}](../../tests/Maths.test.ts#L${anchor})`;

const asSpec = (...links) =>
  asFile(links.map((cited, index) => `Statement ${index + 1}. (${cited})`));

const commit = (repo, message) => {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
};

const SYSTEM_SPEC =
  "System statement. ([validated by](../tests/Maths.test.ts#L3))\n";
const ADR = "Decision. ([validated by](../tests/Maths.test.ts#L6))\n";

const makeRepo = (spec, testLines, docs) => {
  const repo = initRepo(mkdtempSync(join(tmpdir(), "reanchor-spec-links-")));

  write(repo, TEST_PATH, asFile(testLines));
  write(repo, "README.md", asFile(["# Demo", "Run npm test."]));
  write(repo, "adrs/.gitkeep", "");
  write(repo, SPEC_PATH, spec);
  Object.entries(docs).forEach(([path, content]) => write(repo, path, content));
  commit(repo, "baseline");
  git(repo, "checkout", "-q", "-b", "feature");

  return repo;
};

const prependIntro = (repo, testLines = MATHS_TEST) => {
  write(repo, TEST_PATH, asFile([...INTRO, ...testLines]));
};

const replaceLine = (lines, line, replacement) => [
  ...lines.slice(0, line - 1),
  ...replacement,
  ...lines.slice(line),
];

const repos = [];

const repoWith = (spec, testLines = MATHS_TEST, docs = {}) => {
  const repo = makeRepo(spec, testLines, docs);

  repos.push(repo);

  return repo;
};

describe("re-lint-reanchor", () => {
  afterEach(() => {
    repos
      .splice(0)
      .forEach((repo) => rmSync(repo, { recursive: true, force: true }));
  });

  it("moves a titled link from L5 to its test declaration on L7 when two lines are inserted above", () => {
    const repo = repoWith(asSpec(link("validated by subtracts numbers", "5")));

    prependIntro(repo);
    const result = run(repo, "main");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /re-anchored: 1, up to date: 0/);
    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by subtracts numbers", "7")),
    );
  });

  it("moves a titled link from L3 to its test declaration on L5 when its cited assertion is rewritten in place", () => {
    const repo = repoWith(asSpec(link("validated by adds numbers", "3")));

    write(
      repo,
      TEST_PATH,
      asFile(
        replaceLine(MATHS_TEST, 2, [
          '  it("multiplies numbers", () => {',
          "    expect(2 * 2).toBe(4);",
          "  });",
          '  it("adds numbers", () => {',
          "    expect(add(1, 1)).toBe(2);",
        ]).filter((_, index) => index !== 6),
      ),
    );
    const result = run(repo, "main");

    assert.equal(result.status, 0);
    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by adds numbers", "5")),
    );
  });

  it("maps a titled link on the L3 assertion to the L5 assertion when two lines are inserted above", () => {
    const repo = repoWith(asSpec(link("validated by adds numbers", "3")));

    prependIntro(repo);
    run(repo, "main");

    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by adds numbers", "5")),
    );
  });

  it("keeps a titled link on L3 that already lies inside the span of its test", () => {
    const repo = repoWith(asSpec(link("validated by adds numbers", "3")));

    write(repo, TEST_PATH, asFile([...MATHS_TEST, "// trailing note"]));
    const result = run(repo, "--check", "main");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /stale: 0, up to date: 1/);
  });

  it("unwraps a title written in backticks before looking it up, L5 to L7", () => {
    const repo = repoWith(
      asSpec(link("validated by `subtracts numbers`", "5")),
    );

    prependIntro(repo);
    run(repo, "main");

    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by `subtracts numbers`", "7")),
    );
  });

  it("maps untitled links on L6 and L3 to L8 and L5 in a spec, the system spec and an ADR", () => {
    const repo = repoWith(asSpec(link("validated by", "6")), MATHS_TEST, {
      ".specify/spec.md": SYSTEM_SPEC,
      "adrs/ADR-001.md": ADR,
    });

    prependIntro(repo);
    commit(repo, "prepend imports");
    const result = run(repo, "main");

    assert.equal(result.status, 0);
    assert.deepEqual(
      [
        read(repo, SPEC_PATH),
        read(repo, ".specify/spec.md"),
        read(repo, "adrs/ADR-001.md"),
      ],
      [
        asSpec(link("validated by", "8")),
        "System statement. ([validated by](../tests/Maths.test.ts#L5))\n",
        "Decision. ([validated by](../tests/Maths.test.ts#L8))\n",
      ],
    );
  });

  it("maps a titled link whose title no test carries through the hunks, L6 to L8", () => {
    const repo = repoWith(
      asSpec(link("validated by a test since renamed", "6")),
    );

    prependIntro(repo);
    run(repo, "main");

    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by a test since renamed", "8")),
    );
  });

  it("reports an untitled link on a deleted line and exits 1 in both modes, rewriting nothing", () => {
    const spec = asSpec(link("validated by", "6"));
    const repo = repoWith(spec);

    write(repo, TEST_PATH, asFile(replaceLine(MATHS_TEST, 6, [])));
    const check = run(repo, "--check", "main");
    const rewrite = run(repo, "main");

    assert.deepEqual([check.status, rewrite.status], [1, 1]);
    assert.ok(
      rewrite.stderr.includes(
        "unmapped specs/maths/spec.md: ../../tests/Maths.test.ts#L6 -> #L6 was deleted or rewritten on this branch",
      ),
    );
    assert.equal(read(repo, SPEC_PATH), spec);
  });

  it("reports an untitled link whose cited line was rewritten in place", () => {
    const repo = repoWith(asSpec(link("validated by", "3")));

    write(
      repo,
      TEST_PATH,
      asFile(replaceLine(MATHS_TEST, 3, ["    expect(add(1, 1)).toBe(2);"])),
    );
    const result = run(repo, "main");

    assert.equal(result.status, 1);
    assert.match(result.stdout, /unmapped: 1/);
  });

  it("keeps a link whose href this branch edited by hand as authored", () => {
    const repo = repoWith(asSpec(link("validated by", "6")));

    write(repo, TEST_PATH, asFile(replaceLine(MATHS_TEST, 6, [])));
    write(repo, SPEC_PATH, asSpec(link("validated by", "5")));
    const result = run(repo, "--check", "main");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /kept as authored: 1/);
  });

  it("keeps a link this branch added above as authored and still maps L6 below it to L8", () => {
    const repo = repoWith(asSpec(link("validated by", "6")));

    prependIntro(repo);
    write(
      repo,
      SPEC_PATH,
      `New statement. (${link("validated by", "4")})\n${asSpec(link("validated by", "6"))}`,
    );
    run(repo, "main");

    assert.equal(
      read(repo, SPEC_PATH),
      `New statement. (${link("validated by", "4")})\n${asSpec(link("validated by", "8"))}`,
    );
  });

  it("maps a link on a statement this branch reworded, L6 to L8", () => {
    const repo = repoWith(asSpec(link("validated by", "6")));

    prependIntro(repo);
    write(
      repo,
      SPEC_PATH,
      `Statement one, reworded. (${link("validated by", "6")})\n`,
    );
    run(repo, "main");

    assert.equal(
      read(repo, SPEC_PATH),
      `Statement one, reworded. (${link("validated by", "8")})\n`,
    );
  });

  it("a second run against the same merge base changes nothing", () => {
    const repo = repoWith(asSpec(link("validated by", "6"), link("L3", "3")));

    prependIntro(repo);
    run(repo, "main");
    const afterFirst = read(repo, SPEC_PATH);
    const second = run(repo, "main");

    assert.equal(second.status, 0);
    assert.match(second.stdout, /re-anchored: 0, up to date: 2/);
    assert.equal(read(repo, SPEC_PATH), afterFirst);
  });

  it("--check exits 1 naming a stale link and rewrites nothing, then exits 0 after a run", () => {
    const spec = asSpec(link("validated by", "6"));
    const repo = repoWith(spec);

    prependIntro(repo);
    const stale = run(repo, "--check", "main");
    const specAfterCheck = read(repo, SPEC_PATH);

    run(repo, "main");
    const healed = run(repo, "--check", "main");

    assert.equal(stale.status, 1);
    assert.ok(
      stale.stderr.includes(
        "stale specs/maths/spec.md: ../../tests/Maths.test.ts#L6 -> #L8",
      ),
    );
    assert.equal(specAfterCheck, spec);
    assert.equal(healed.status, 0);
  });

  it("leaves a titled link into a test file this branch did not change alone, and --all moves it", () => {
    const spec = asSpec(link("validated by subtracts numbers", "2"));
    const repo = repoWith(spec);

    write(repo, "README.md", asFile(["# Demo", "", "Run npm test."]));
    const scoped = run(repo, "main");
    const specAfterScoped = read(repo, SPEC_PATH);
    const swept = run(repo, "--all", "main");

    assert.match(scoped.stdout, /out of scope: 1/);
    assert.equal(specAfterScoped, spec);
    assert.equal(swept.status, 0);
    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by subtracts numbers", "5")),
    );
  });

  it("maps a link into README.md, titled or not, from L2 to L3 through the hunks", () => {
    const readmeLink = (label, line) => `[${label}](../../README.md#L${line})`;
    const repo = repoWith(
      asSpec(
        readmeLink("validated by", 2),
        readmeLink("validated by the test command", 2),
      ),
    );

    write(repo, "README.md", asFile(["# Demo", "", "Run npm test."]));
    run(repo, "main");

    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(
        readmeLink("validated by", 3),
        readmeLink("validated by the test command", 3),
      ),
    );
  });

  it("an L6 line label follows its href to L8", () => {
    const repo = repoWith(asSpec(link("L6", "6")));

    prependIntro(repo);
    const result = run(repo, "main");

    assert.equal(result.status, 0);
    assert.equal(read(repo, SPEC_PATH), asSpec(link("L8", "8")));
  });

  it("an L9 line label on an L6 href fails --check as mislabelled and a run syncs it to L6", () => {
    const spec = asSpec(link("L9", "6"));
    const repo = repoWith(spec);
    const check = run(repo, "--check", "main");
    const specAfterCheck = read(repo, SPEC_PATH);
    const rewrite = run(repo, "main");

    assert.equal(check.status, 1);
    assert.ok(
      check.stderr.includes(
        "mislabelled specs/maths/spec.md: ../../tests/Maths.test.ts#L6 -> label reads L9",
      ),
    );
    assert.equal(specAfterCheck, spec);
    assert.match(rewrite.stdout, /relabelled: 1/);
    assert.equal(read(repo, SPEC_PATH), asSpec(link("L6", "6")));
  });

  it("reports a title two tests carry and exits 1", () => {
    const twice = [
      ...MATHS_TEST.slice(0, 7),
      '  it("adds numbers", () => {});',
      "});",
    ];
    const repo = repoWith(
      asSpec(link("validated by adds numbers", "3")),
      twice,
    );

    prependIntro(repo, twice);
    const result = run(repo, "main");

    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes('several tests carry the title "adds numbers"'),
    );
  });

  it("an anchor on a blank line or into a missing file is rotten in both modes", () => {
    const repo = repoWith(
      asSpec(
        link("validated by", "2"),
        "[validated by](../../tests/Gone.test.ts#L1)",
        "[validated by](../../README.md#L9)",
      ),
      replaceLine(MATHS_TEST, 2, [""]),
    );
    const check = run(repo, "--check", "main");
    const rewrite = run(repo, "main");

    assert.deepEqual([check.status, rewrite.status], [1, 1]);
    assert.deepEqual(
      check.stderr.split("\n").filter((line) => line.startsWith("rotten")),
      [
        "rotten specs/maths/spec.md: ../../tests/Maths.test.ts#L2 -> #L2 lands on a blank or closing line",
        "rotten specs/maths/spec.md: ../../tests/Gone.test.ts#L1 -> tests/Gone.test.ts does not exist in the working tree",
        "rotten specs/maths/spec.md: ../../README.md#L9 -> #L9 is beyond the end of README.md",
      ],
    );
  });

  it("leaves a link whose fragment is not a line number, and a web URL, untouched", () => {
    const spec = asSpec(
      "[validated by](../../tests/Maths.test.ts#A1)",
      "[source](https://example.test/Maths.test.ts#L6)",
    );
    const repo = repoWith(spec);

    prependIntro(repo);
    run(repo, "main");

    assert.equal(read(repo, SPEC_PATH), spec);
  });

  it("maps L6, an L6 label and setup L3 to L9, L9 and L5 during an uncommitted merge of main", () => {
    const setupLink = (line) => `[validated by](../../tests/setup.ts#L${line})`;
    const repo = repoWith(
      asSpec(link("validated by", "6"), link("L6", "6"), setupLink(3)),
    );

    git(repo, "checkout", "-q", "main");
    write(repo, "tests/setup.ts", asFile(["a", "b", "c"]));
    commit(repo, "setup before the feature");
    git(repo, "branch", "-f", "feature");
    write(repo, "tests/setup.ts", asFile(["main", "a", "b", "c"]));
    write(repo, TEST_PATH, asFile(["// main", ...MATHS_TEST]));
    write(
      repo,
      SPEC_PATH,
      asSpec(link("validated by", "7"), link("L7", "7"), setupLink(4)),
    );
    commit(repo, "main shifts every cited line by one");
    git(repo, "checkout", "-q", "feature");
    write(repo, "tests/setup.ts", asFile(["a", "b", "feature", "c"]));
    write(
      repo,
      TEST_PATH,
      asFile([...MATHS_TEST.slice(0, 2), ...INTRO, ...MATHS_TEST.slice(2)]),
    );
    commit(repo, "feature inserts below the second line");
    git(repo, "merge", "-q", "--no-commit", "--no-ff", "main");
    const result = run(repo, "main");

    assert.equal(result.status, 0);
    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by", "9"), link("L9", "9"), setupLink(5)),
    );
  });

  it("defaults the base ref to origin/main", () => {
    const repo = repoWith(asSpec(link("validated by", "6")));
    const clone = mkdtempSync(join(tmpdir(), "reanchor-spec-links-clone-"));

    repos.push(clone);
    git(repo, "checkout", "-q", "main");
    execFileSync("git", ["clone", "-q", repo, join(clone, "repo")], {
      stdio: "ignore",
    });
    const cloneRepo = join(clone, "repo");

    prependIntro(cloneRepo);
    run(cloneRepo);

    assert.equal(read(cloneRepo, SPEC_PATH), asSpec(link("validated by", "8")));
  });

  it("--corpus replaces the default documents with the ones its globs match", () => {
    const repo = repoWith(asSpec(link("validated by", "6")), MATHS_TEST, {
      "docs/maths.md": "Note. ([validated by](../tests/Maths.test.ts#L6))\n",
    });

    prependIntro(repo);
    run(repo, "--corpus", "docs/**/*.md", "main");

    assert.deepEqual(
      [read(repo, "docs/maths.md"), read(repo, SPEC_PATH)],
      [
        "Note. ([validated by](../tests/Maths.test.ts#L8))\n",
        asSpec(link("validated by", "6")),
      ],
    );
  });

  it("an unknown flag, a --corpus without a glob or a second base ref exits 2 with usage", () => {
    const repo = repoWith(asSpec(link("validated by", "6")));

    assertUsageError(run(repo, "--frobnicate"));
    assertUsageError(run(repo, "--corpus"));
    assertUsageError(run(repo, "main", "feature"));
  });

  it("re-anchors the whole corpus when git runs from a subdirectory of the work tree", () => {
    const repo = repoWith(asSpec(link("validated by subtracts numbers", "5")));

    prependIntro(repo);
    const result = run(join(repo, "specs", "maths"), "main");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /re-anchored: 1, up to date: 0/);
    assert.equal(
      read(repo, SPEC_PATH),
      asSpec(link("validated by subtracts numbers", "7")),
    );
  });

  it("an unknown base ref exits 2 naming the ref", () => {
    const result = run(
      repoWith(asSpec(link("validated by", "6"))),
      "no-such-ref",
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /no-such-ref/);
  });
});
