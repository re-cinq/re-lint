import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findMisplacedCoverageLinks,
  linksForStatements,
  parseTestLinksInStatement,
} from "#spec/spec-link-parser.js";

const VALIDATED = "([validated by adds numbers](tests/a.test.ts#L10))";
const FROM_PLAN = "([from plan](https://example.test/plans/7))";

test("parseTestLinksInStatement reads a validated-by link in the last trailing parenthetical", () => {
  assert.deepEqual(parseTestLinksInStatement(`Adds. ${VALIDATED}`), [
    { label: "validated by adds numbers", path: "tests/a.test.ts", line: 10 },
  ]);
});

test("parseTestLinksInStatement reads tests/a.test.ts#L10 from a trailing parenthetical followed by a from-plan one", () => {
  assert.deepEqual(
    parseTestLinksInStatement(`Adds. ${VALIDATED} ${FROM_PLAN}`),
    [{ label: "validated by adds numbers", path: "tests/a.test.ts", line: 10 }],
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
    { label: "it", path: "tests/a.test.ts", line: 1 },
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
