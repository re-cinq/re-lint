import { test } from "node:test";
import assert from "node:assert/strict";
import { indexClones } from "./report.mjs";

const side = (name, start, end, startColumn, endColumn) => ({
  name,
  start,
  end,
  startLoc: { line: start, column: startColumn, position: 0 },
  endLoc: { line: end, column: endColumn, position: 0 },
});

const report = {
  duplicates: [
    {
      firstFile: side("/abs/one.ts", 2, 64, 0, 1),
      secondFile: side("/abs/two.ts", 10, 72, 4, 3),
      lines: 63,
      tokens: 328,
      format: "typescript",
      fragment: "...",
    },
  ],
  statistics: {},
};

test("one duplicate between /abs/one.ts and /abs/two.ts indexes one clone per side", () => {
  const byFile = indexClones(report);

  assert.deepEqual([...byFile.keys()], ["/abs/one.ts", "/abs/two.ts"]);
  assert.deepEqual(byFile.get("/abs/one.ts"), [
    {
      file: "/abs/one.ts",
      start: { line: 2, column: 0 },
      end: { line: 64, column: 1 },
      twin: { file: "/abs/two.ts", startLine: 10, endLine: 72 },
      lines: 63,
      tokens: 328,
    },
  ]);
  assert.deepEqual(byFile.get("/abs/two.ts"), [
    {
      file: "/abs/two.ts",
      start: { line: 10, column: 4 },
      end: { line: 72, column: 3 },
      twin: { file: "/abs/one.ts", startLine: 2, endLine: 64 },
      lines: 63,
      tokens: 328,
    },
  ]);
});

test("two duplicates touching /abs/one.ts yield two clones under that file", () => {
  const twoHits = {
    duplicates: [
      report.duplicates[0],
      {
        firstFile: side("/abs/three.ts", 1, 12, 0, 1),
        secondFile: side("/abs/one.ts", 80, 91, 0, 1),
        lines: 12,
        tokens: 70,
      },
    ],
  };

  const clones = indexClones(twoHits).get("/abs/one.ts");

  assert.deepEqual(
    clones.map((clone) => [clone.start.line, clone.twin.file]),
    [
      [2, "/abs/two.ts"],
      [80, "/abs/three.ts"],
    ],
  );
});

test("a report with no duplicates key indexes to an empty map", () => {
  assert.deepEqual(indexClones({ statistics: {} }), new Map());
});
