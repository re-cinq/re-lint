import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statementCoverage,
  unlinkedTestableStatements,
} from "#spec/spec-status-coverage.js";

const link = (line) => `([validated by](payments.test.ts#L${line}))`;

// Two testable requirements land on lines 9 and 11.
const spec = (firstLink, secondLink) =>
  [
    "# My Feature", // 1
    "", // 2
    "Intro paragraph describing the feature.", // 3
    "", // 4
    "## Functional Requirements", // 5
    "", // 6
    "The system returns a receipt for every payment. " + firstLink, // 7
    "", // 8
    "The system emails the receipt to the payer. " + secondLink, // 9
  ].join("\n");

const onlyLineTen = (candidate) => candidate.line === 10;

test("counts a statement linked when any link is present and no predicate is given", () => {
  assert.deepEqual(statementCoverage(spec(link(10), link(99))), {
    testable: 2,
    linked: 2,
    unlinked: [],
    ungrounded: [],
  });
});

test("counts only the grounded statement linked when the predicate rejects L99", () => {
  const coverage = statementCoverage(spec(link(10), link(99)), {
    isGroundedLink: onlyLineTen,
  });

  assert.deepEqual(
    [coverage.testable, coverage.linked, coverage.ungrounded.length],
    [2, 1, 1],
  );
});

test("lists a hollow statement as both unlinked and ungrounded", () => {
  const coverage = statementCoverage(spec(link(10), link(99)), {
    isGroundedLink: onlyLineTen,
  });

  assert.deepEqual(coverage.unlinked, coverage.ungrounded);
});

test("leaves a statement with no link unlinked but not ungrounded", () => {
  const coverage = statementCoverage(spec(link(10), ""), {
    isGroundedLink: onlyLineTen,
  });

  assert.deepEqual(
    [coverage.unlinked.length, coverage.ungrounded.length],
    [1, 0],
  );
});

test("keeps a statement linked when one of its two links is grounded", () => {
  const coverage = statementCoverage(
    spec(
      `(${link(99).slice(1, -1)}, [validated by](payments.test.ts#L10))`,
      link(10),
    ),
    {
      isGroundedLink: onlyLineTen,
    },
  );

  assert.deepEqual([coverage.linked, coverage.ungrounded], [2, []]);
});

test("unlinkedTestableStatements names the hollow statement when given the predicate", () => {
  const unlinked = unlinkedTestableStatements(spec(link(10), link(99)), {
    isGroundedLink: onlyLineTen,
  });

  assert.deepEqual(
    unlinked.map((statement) => statement.line),
    [9],
  );
});
