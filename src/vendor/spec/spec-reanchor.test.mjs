import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anchorLinksIn,
  createReanchorer,
  findTestDeclarations,
  mapLine,
  pairWithBase,
  parseHunks,
  rottenReason,
  selectCorpus,
  syncedLabel,
  titleOfLabel,
} from "#spec/spec-reanchor.js";

const HUNKS = parseHunks(
  ["@@ -0,0 +1,2 @@", "+a", "+b", "@@ -5 +7 @@", "-old", "+new"].join("\n"),
);

test("parseHunks reads an insertion at the top and a one-line rewrite", () => {
  assert.deepEqual(HUNKS, [
    { oldStart: 0, oldCount: 0, newCount: 2 },
    { oldStart: 5, oldCount: 1, newCount: 1 },
  ]);
});

test("mapLine shifts L3 to L5, drops rewritten L5 and shifts L6 to L8", () => {
  assert.deepEqual(
    [3, 5, 6].map((line) => mapLine(line, HUNKS)),
    [5, null, 8],
  );
});

test("findTestDeclarations unescapes and unwraps titles with their lines", () => {
  const source = [
    'it("reads \\"quoted\\" text", () => {});',
    "  test.skip(`\\`wrapped\\``, () => {});",
    "expect(it).toBe(1);",
  ].join("\n");

  assert.deepEqual(findTestDeclarations(source), [
    { title: 'reads "quoted" text', line: 1 },
    { title: "wrapped", line: 2 },
  ]);
});

test("titleOfLabel names the test of a titled label and null for L7", () => {
  assert.deepEqual(
    [titleOfLabel("validated by  adds   numbers"), titleOfLabel("L7")],
    ["adds numbers", null],
  );
});

test("pairWithBase gives a reworded line's link the base line 6", () => {
  const base = ["One. ([validated by](../../a.test.ts#L6))"];
  const working = ["One, reworded. ([validated by](../../a.test.ts#L6))"];
  const [[paired]] = pairWithBase(
    anchorLinksIn(working, "specs/a/spec.md"),
    anchorLinksIn(base, "specs/a/spec.md"),
    base,
    working,
  );

  assert.deepEqual(paired, {
    label: "validated by",
    linkPath: "../../a.test.ts",
    line: 6,
    target: "a.test.ts",
    baseLine: 6,
  });
});

test("rottenReason passes a code line and reports a closing brace on L2", () => {
  assert.deepEqual(
    [
      rottenReason("a.ts", "run();\n});\n", 1),
      rottenReason("a.ts", "run();\n});\n", 2),
    ],
    [null, "#L2 lands on a blank or closing line"],
  );
});

test("syncedLabel moves L3 to L9 and keeps a descriptive label", () => {
  assert.deepEqual(
    [syncedLabel("L3", 9), syncedLabel("the command", 9)],
    ["L9", "the command"],
  );
});

test("selectCorpus orders by pattern, sorts within one and lists a path once", () => {
  const paths = [
    "specs/b/spec.md",
    "specs/a/nested/spec.md",
    "adrs/ADR-002.md",
    "adrs/ADR-001.md",
    "adrs/sub/ADR-003.md",
    "README.md",
  ];

  assert.deepEqual(
    selectCorpus(paths, ["specs/**/spec.md", "adrs/*.md", "specs/b/*.md"]),
    [
      "specs/a/nested/spec.md",
      "specs/b/spec.md",
      "adrs/ADR-001.md",
      "adrs/ADR-002.md",
    ],
  );
});

test("a reanchorer maps a link L6 to L8 through an in-memory repository", () => {
  const reanchor = createReanchorer(
    {
      workingFile: () => "a\nb\nc\nd\ne\nf\ng\nh\n",
      hunks: () => [{ oldStart: 0, oldCount: 0, newCount: 2 }],
      isChanged: () => true,
    },
    { check: false, all: false },
  );
  const source = "One. ([validated by](../../src/a.ts#L6))";
  const result = reanchor({
    docPath: "specs/a/spec.md",
    source,
    baseSource: source,
  });

  assert.deepEqual(
    [result.text, result.tally.moved],
    ["One. ([validated by](../../src/a.ts#L8))", 1],
  );
});
