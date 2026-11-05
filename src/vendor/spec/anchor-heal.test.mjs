import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorHashOf } from "#spec/anchor-hash.js";
import { similarity } from "#spec/anchor-heal.js";
import {
  anchorLinksIn,
  createReanchorer,
  pairWithBase,
  titleOfLabel,
} from "#spec/spec-reanchor.js";

const TEST_PATH = "tests/a.test.ts";
const HREF = "../../tests/a.test.ts";
const ADDS = '  it("adds two numbers", () => {';
const BODY = "    expect(add(1, 1)).toBe(2);";
const SUBTRACTS = '  it("subtracts numbers", () => {';
const BASE = [
  'describe("a", () => {',
  ADDS,
  BODY,
  "  });",
  SUBTRACTS,
  "    expect(sub(2, 1)).toBe(1);",
  "  });",
  "});",
].join("\n");
const HEADER = ["// one", "// two", "// three"].join("\n");

const fakeRepository = ({
  working = {},
  base = {},
  hunks = {},
  changed = true,
  renames = {},
}) => ({
  workingFile: (path) => working[path] ?? null,
  baseFile: (path) => base[path] ?? null,
  hunks: (path) => hunks[path] ?? [],
  isChanged: () => changed,
  renamedTo: (path) => renames[path] ?? [],
});

const reanchorHashed = (repository, source, options = {}) =>
  createReanchorer(repository, {
    check: false,
    all: false,
    addHashes: true,
    ...options,
  })({ docPath: "specs/a/spec.md", source, baseSource: source });

const statement = (label, line, href = HREF) =>
  `One. ([${label}](${href}#L${line}))`;
const hashed = (line, text, href = HREF) =>
  statement(`validated by @${anchorHashOf(text)}`, line, href);

test("adds the hash of L2 to a link that has none and keeps its line", () => {
  const result = reanchorHashed(
    fakeRepository({
      working: { [TEST_PATH]: BASE },
      base: { [TEST_PATH]: BASE },
    }),
    statement("validated by", 2),
  );

  assert.deepEqual([result.text, result.tally.hashed], [hashed(2, ADDS), 1]);
});

test("leaves a hashless link into a file the branch did not change alone, and hashes it with hashUnchanged", () => {
  const repository = fakeRepository({
    working: { [TEST_PATH]: BASE },
    changed: false,
  });
  const source = statement("validated by", 2);

  assert.deepEqual(
    [
      reanchorHashed(repository, source).text,
      reanchorHashed(repository, source, { hashUnchanged: true }).text,
    ],
    [source, hashed(2, ADDS)],
  );
});

test("moves a hashed link from L2 to L5 after three lines are inserted above", () => {
  const result = reanchorHashed(
    fakeRepository({
      working: { [TEST_PATH]: `${HEADER}\n${BASE}` },
      base: { [TEST_PATH]: BASE },
    }),
    hashed(2, ADDS),
  );

  assert.deepEqual([result.text, result.tally.moved], [hashed(5, ADDS), 1]);
});

test("picks the copy of the hashed line at L20 over L2 for a link written at L18", () => {
  const working = [BASE, ...Array(11).fill("// filler line"), ADDS].join("\n");
  const result = reanchorHashed(
    fakeRepository({ working: { [TEST_PATH]: working } }),
    hashed(18, ADDS),
  );

  assert.equal(result.text, hashed(20, ADDS));
});

test("rewrites hash and line of a test the branch renamed in place on L2", () => {
  const renamed = '  it("adds two whole numbers", () => {';
  const result = reanchorHashed(
    fakeRepository({
      working: { [TEST_PATH]: BASE.replace(ADDS, renamed) },
      base: { [TEST_PATH]: BASE },
      hunks: {
        [TEST_PATH]: [{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }],
      },
    }),
    hashed(2, ADDS),
  );

  assert.deepEqual(
    [result.text, result.tally.renamed],
    [hashed(2, renamed), 1],
  );
});

test("rewrites hash and line to L5 of a test renamed in place below three inserted lines", () => {
  const renamed = '  it("adds two whole numbers", () => {';
  const result = reanchorHashed(
    fakeRepository({
      working: { [TEST_PATH]: `${HEADER}\n${BASE.replace(ADDS, renamed)}` },
      base: { [TEST_PATH]: BASE },
      hunks: {
        [TEST_PATH]: [
          { oldStart: 0, oldCount: 0, newStart: 1, newCount: 3 },
          { oldStart: 2, oldCount: 1, newStart: 5, newCount: 1 },
        ],
      },
    }),
    hashed(2, ADDS),
  );

  assert.equal(result.text, hashed(5, renamed));
});

test("follows a test renamed and moved below its neighbour to L6 by similarity", () => {
  const renamed = '  it("adds two whole numbers", () => {';
  const working = [
    'describe("a", () => {',
    SUBTRACTS,
    "    expect(sub(2, 1)).toBe(1);",
    "  });",
    "",
    renamed,
    BODY,
    "  });",
    "});",
  ].join("\n");
  const result = reanchorHashed(
    fakeRepository({
      working: { [TEST_PATH]: working },
      base: { [TEST_PATH]: BASE },
      hunks: {
        [TEST_PATH]: [
          { oldStart: 2, oldCount: 3, newStart: 1, newCount: 0 },
          { oldStart: 7, oldCount: 0, newStart: 5, newCount: 4 },
        ],
      },
    }),
    hashed(2, ADDS),
  );

  assert.equal(result.text, hashed(6, renamed));
});

test("follows a hashed link into the file git says the branch renamed its test file to", () => {
  const result = reanchorHashed(
    fakeRepository({
      working: { "tests/b.test.ts": BASE },
      base: { [TEST_PATH]: BASE },
      renames: { [TEST_PATH]: ["tests/b.test.ts"] },
    }),
    hashed(2, ADDS),
  );

  assert.equal(result.text, hashed(2, ADDS, "../../tests/b.test.ts"));
});

test("reports a hashed link whose test was rewritten beyond recognition and leaves it as written", () => {
  const source = hashed(2, ADDS);
  const result = reanchorHashed(
    fakeRepository({
      working: {
        [TEST_PATH]: BASE.replace(ADDS, '  it("parses config files", () => {'),
      },
      base: { [TEST_PATH]: BASE },
      hunks: {
        [TEST_PATH]: [{ oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }],
      },
    }),
    source,
  );

  assert.deepEqual(
    [result.text, result.findings.map((finding) => finding.kind)],
    [source, ["unmapped"]],
  );
});

test("reports a hashed link whose hash is on no line now or at the merge base", () => {
  const result = reanchorHashed(
    fakeRepository({
      working: { [TEST_PATH]: BASE },
      base: { [TEST_PATH]: BASE },
    }),
    statement("validated by @00000000", 2),
  );

  assert.match(result.findings[0].detail, /carries @00000000/);
});

test("touches only links on lines the branch wrote under authoredOnly", () => {
  const stale = hashed(2, ADDS);
  const written = statement("validated by", 5).replace("One.", "Two.");
  const repository = fakeRepository({
    working: { [TEST_PATH]: `${HEADER}\n${BASE}` },
    base: { [TEST_PATH]: BASE },
  });
  const result = createReanchorer(repository, {
    check: false,
    all: false,
    addHashes: true,
    authoredOnly: true,
  })({
    docPath: "specs/a/spec.md",
    source: [stale, written].join("\n"),
    baseSource: stale,
  });

  assert.deepEqual(result.text.split("\n"), [
    stale,
    hashed(5, ADDS).replace("One.", "Two."),
  ]);
});

test("reads the title of a hashed titled label without its hash", () => {
  assert.equal(
    titleOfLabel("validated by returns true @a3f9c1d2"),
    "returns true",
  );
});

test("pairs a link whose fix changed only its hash and line with base line 2, as not edited", () => {
  const base = ["One. ([validated by](x.test.ts#L2))"];
  const working = ["One. ([validated by @abcdef12](x.test.ts#L5))"];
  const [[paired]] = pairWithBase(
    anchorLinksIn(working, "specs/a/spec.md"),
    anchorLinksIn(base, "specs/a/spec.md"),
    base,
    working,
  );

  assert.deepEqual([paired.baseLine, paired.edited], [2, false]);
});

test("scores the same line 1 and lines sharing no character pair 0", () => {
  assert.deepEqual(
    [similarity("abcdef", "abcdef"), similarity("abab", "cdcd")],
    [1, 0],
  );
});

test("reads no title from a hashed file label, so the link is never looked up as a test called maths.test.ts", () => {
  assert.equal(titleOfLabel("`maths.test.ts@a3f9c1d2`"), null);
});

test("trades the stale :2 of a file label for the hash when it adds one", () => {
  const result = reanchorHashed(
    fakeRepository({ working: { [TEST_PATH]: BASE } }),
    statement("`a.test.ts:2`", 2),
  );

  assert.equal(
    result.text,
    statement(`\`a.test.ts@${anchorHashOf(ADDS)}\``, 2),
  );
});
