import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findMisplacedCoverageLinks,
  linksForStatements,
  parseTestLinksInStatement,
  splitHashedLabel,
  withAnchorHash,
} from "#spec/spec-link-parser.js";

const VALIDATED = "([validated by adds numbers](tests/a.test.ts#L10))";
const FROM_PLAN = "([from plan](https://example.test/plans/7))";

test("parseTestLinksInStatement reads a validated-by link in the last trailing parenthetical", () => {
  assert.deepEqual(parseTestLinksInStatement(`Adds. ${VALIDATED}`), [
    {
      label: "validated by adds numbers",
      path: "tests/a.test.ts",
      line: 10,
      hash: null,
    },
  ]);
});

test("parseTestLinksInStatement reads tests/a.test.ts#L10 from a trailing parenthetical followed by a from-plan one", () => {
  assert.deepEqual(
    parseTestLinksInStatement(`Adds. ${VALIDATED} ${FROM_PLAN}`),
    [
      {
        label: "validated by adds numbers",
        path: "tests/a.test.ts",
        line: 10,
        hash: null,
      },
    ],
  );
});

test("parseTestLinksInStatement reads links from three trailing parentheticals separated by a period", () => {
  const statement = `Adds. ([validated by a](tests/a.test.ts#L1)). ([validated by b](tests/b.test.ts#L2)) ${FROM_PLAN}.`;

  assert.deepEqual(
    parseTestLinksInStatement(statement).map((link) => link.path),
    ["tests/a.test.ts", "tests/b.test.ts"],
  );
});

test("parseTestLinksInStatement ignores a test link in a prose parenthetical before the trailing one", () => {
  const statement = `Adds (see [it](tests/a.test.ts#L1) for details) ${FROM_PLAN}`;

  assert.deepEqual(parseTestLinksInStatement(statement), []);
});

test("findMisplacedCoverageLinks flags nothing when the test link sits in an earlier trailing parenthetical", () => {
  assert.deepEqual(
    findMisplacedCoverageLinks(`Adds. ${VALIDATED} ${FROM_PLAN}`),
    [],
  );
});

test("findMisplacedCoverageLinks flags a test link in a prose parenthetical before the trailing ones", () => {
  const statement = `Adds (see [it](tests/a.test.ts#L1) for details) ${VALIDATED}`;

  assert.deepEqual(findMisplacedCoverageLinks(statement), [
    { label: "it", path: "tests/a.test.ts", line: 1, hash: null },
  ]);
});

test("linksForStatements keeps a statement whose validated-by link precedes a from-plan link as one linked statement", () => {
  const found = linksForStatements(
    `# Maths\n\nThe calculator adds numbers. ${VALIDATED} ${FROM_PLAN}\n`,
  );

  assert.deepEqual(
    found.map(({ testLinks }) => testLinks.map((link) => link.line)),
    [[10]],
  );
});

test("splitHashedLabel reads the hash inside backticks and keeps the backticks on the text", () => {
  assert.deepEqual(splitHashedLabel("`commit-trailers.test.ts@a3f9c1d2`"), {
    text: "`commit-trailers.test.ts`",
    hash: "a3f9c1d2",
  });
});

test("splitHashedLabel reads the hash after a validated-by title", () => {
  assert.deepEqual(splitHashedLabel("validated by returns true @a3f9c1d2"), {
    text: "validated by returns true",
    hash: "a3f9c1d2",
  });
});

test("splitHashedLabel finds no hash in a file:line label, a bare prefix or a 7-character suffix", () => {
  assert.deepEqual(
    ["`x.test.ts:196`", "validated by", "foo@1234567"].map(
      (label) => splitHashedLabel(label).hash,
    ),
    [null, null, null],
  );
});

test("withAnchorHash appends inside backticks, after a prefix, and replaces an old hash", () => {
  assert.deepEqual(
    [
      withAnchorHash("`x.test.ts:196`", "a3f9c1d2"),
      withAnchorHash("validated by", "a3f9c1d2"),
      withAnchorHash("`x.test.ts@00000000`", "a3f9c1d2"),
    ],
    [
      "`x.test.ts:196@a3f9c1d2`",
      "validated by @a3f9c1d2",
      "`x.test.ts@a3f9c1d2`",
    ],
  );
});

test("parseTestLinksInStatement reads the hash of a hashed link", () => {
  assert.deepEqual(
    parseTestLinksInStatement(
      "Does X. ([`a.test.ts@a3f9c1d2`](src/a.test.ts#L12))",
    ),
    [
      {
        label: "`a.test.ts@a3f9c1d2`",
        path: "src/a.test.ts",
        line: 12,
        hash: "a3f9c1d2",
      },
    ],
  );
});
