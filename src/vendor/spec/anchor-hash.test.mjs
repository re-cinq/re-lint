import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  anchorHashOf,
  linesWithHash,
  nearestLine,
  normalizeAnchorLine,
} from "#spec/anchor-hash.js";

const FIXTURES = JSON.parse(
  readFileSync(new URL("./anchor-hash.fixtures.json", import.meta.url), "utf8"),
);

test("normalizes and hashes every line of the shared fixtures, Go and Python included", () => {
  assert.deepEqual(
    FIXTURES.map(({ line }) => ({
      line,
      normalized: normalizeAnchorLine(line),
      hash: anchorHashOf(line),
    })),
    FIXTURES,
  );
});

test("hashes a test line the same whatever its quotes, tabs and spacing", () => {
  const hashes = [
    "it('returns true when positive', () => {",
    '\tit("returns true when positive", () => {',
    'it("returns   true when positive",()=>{',
  ].map(anchorHashOf);

  assert.deepEqual(new Set(hashes).size, 1);
});

test("gives no hash to a closing line", () => {
  assert.equal(anchorHashOf("});"), null);
});

test("finds both lines of a source that carry the same hash", () => {
  const line = 'it("returns true when positive", () => {';
  const source = [line, "});", line].join("\n");

  assert.deepEqual(linesWithHash(source, anchorHashOf(line)), [1, 3]);
});

test("picks 40 from 10 and 40 near 30, and 10 near 25", () => {
  assert.deepEqual(
    [nearestLine([10, 40], 30), nearestLine([10, 40], 25)],
    [40, 10],
  );
});

test("picks no line from no candidates", () => {
  assert.equal(nearestLine([], 5), null);
});
