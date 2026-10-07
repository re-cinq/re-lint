import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  groundedLinkPredicate,
  isGroundedLink,
  resetEvidenceCache,
} from "./test-evidence.mjs";

const ROOT = resolve("test-fixtures/require-status-matches-coverage");
const SPEC_PATH = "specs/payments/spec.md";
const where = { root: ROOT, specPath: SPEC_PATH };

afterEach(resetEvidenceCache);

function groundedAt(path, line) {
  return isGroundedLink({ label: "validated by", path, line }, where);
}

test("grounds L3 inside the first test of grounded.test.ts", () => {
  assert.equal(groundedAt("tests/grounded.test.ts", 3), true);
});

test("grounds L5 on the opening line of the second test", () => {
  assert.equal(groundedAt("tests/grounded.test.ts", 5), true);
});

test("does not ground L99 past the end of grounded.test.ts", () => {
  assert.equal(groundedAt("tests/grounded.test.ts", 99), false);
});

test("does not ground L1 on the describe line above the first test", () => {
  assert.equal(groundedAt("tests/grounded.test.ts", 1), false);
});

test("grounds L1 of an it.each tagged template", () => {
  assert.equal(groundedAt("tests/tagged.test.ts", 1), true);
});

test("does not ground L1 of a file that declares no test", () => {
  assert.equal(groundedAt("tests/no-tests.test.ts", 1), false);
});

test("grounds a whole-file link to an existing test file", () => {
  assert.equal(groundedAt("tests/no-tests.test.ts", null), true);
});

test("does not ground a link to a missing file", () => {
  assert.equal(groundedAt("tests/gone.test.ts", 1), false);
});

test("does not ground a whole-file link to a missing file", () => {
  assert.equal(groundedAt("tests/gone.test.ts", null), false);
});

test("grounds L40 of a non-JS test file on its existence alone", () => {
  assert.equal(groundedAt("fixtures/data_test.go", 40), true);
});

test("does not ground a link that climbs out of the root", () => {
  assert.equal(groundedAt("../../../../package.json", null), false);
});

test("resolves a ../ href beside the spec", () => {
  assert.equal(groundedAt("../../tests/grounded.test.ts", 3), true);
});

test("does not ground a directory", () => {
  assert.equal(groundedAt("tests", null), false);
});

test("groundedLinkPredicate answers like isGroundedLink for the bound spec", () => {
  const predicate = groundedLinkPredicate(where);

  assert.deepEqual(
    [
      { path: "tests/grounded.test.ts", line: 3 },
      { path: "tests/grounded.test.ts", line: 99 },
    ].map((link) => predicate({ label: "validated by", ...link })),
    [true, false],
  );
});

test("grounds a link to another repository's test by URL, which this checkout cannot verify", () => {
  assert.equal(
    groundedAt(
      "https://github.com/re-cinq/re-lint/blob/v1.0.0/src/rules/lib/status-coverage.test.mjs",
      104,
    ),
    true,
  );
});
