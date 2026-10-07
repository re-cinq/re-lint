import { test } from "node:test";
import assert from "node:assert/strict";
import { lineRange, replaceLine } from "./line-range.mjs";

test("lineRange spans line 2 of a LF document without its newline", () => {
  assert.deepEqual(lineRange("ab\ncde\nf", 2), [3, 6]);
});

test("lineRange spans the first and the last line", () => {
  assert.deepEqual(
    [lineRange("ab\ncde\nf", 1), lineRange("ab\ncde\nf", 3)],
    [
      [0, 2],
      [7, 8],
    ],
  );
});

test("lineRange leaves the carriage return of a CRLF line outside the range", () => {
  assert.deepEqual(lineRange("ab\r\ncde\r\nf", 2), [4, 7]);
});

test("replaceLine swaps line 2 and keeps the rest", () => {
  assert.equal(replaceLine("ab\ncde\nf", 2, "X"), "ab\nX\nf");
});
