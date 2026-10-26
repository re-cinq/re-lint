import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./require-spec-link.mjs";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test-fixtures",
  "require-spec-link",
);

const OPTS = [{ specsRoot: FIXTURES }];
const ROOTS = "specs/**/*.md or adrs/**/*.md";

function file(rel) {
  return path.join(FIXTURES, rel);
}

// specs/titled/spec.md names each test by title; "adds numbers" is anchored at
// L5, inside "subtracts numbers", and "pending waits" names no test.
const TITLED_TESTS = [
  'describe("maths", () => {',
  '  it("adds numbers", () => {',
  "    expect(1 + 1).toBe(2);",
  "  });",
  '  it("subtracts numbers", () => {',
  "    expect(2 - 1).toBe(1);",
  "  });",
  '  it("waits for pending work", () => {',
  "    expect(true).toBe(true);",
  "  });",
  '  it("multiplies numbers", () => {',
  "    expect(2 * 2).toBe(4);",
  "  });",
  '  it("divides numbers", () => {',
  "    expect(4 / 2).toBe(2);",
  "  });",
  "});",
].join("\n");

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, sourceType: "module" },
});

ruleTester.run("require-spec-link", rule, {
  valid: [
    {
      // a spec.md links this test at line 2
      code: `describe("x", () => {\n  it("works", () => {});\n});`,
      filename: file("tests/linked.test.ts"),
      options: OPTS,
    },
    {
      // an ADR carries a whole-file link (no #L) — proves "spec OR adr"
      code: `it("anything", () => {});`,
      filename: file("tests/adr-linked.test.ts"),
      options: OPTS,
    },
    {
      // a modifier chain (it.skip) is still a named test — whole-file link covers it
      code: `it.skip("anything", () => {});`,
      filename: file("tests/adr-linked.test.ts"),
      options: OPTS,
    },
    {
      // non-test file — the rule does not apply
      code: `const a = 1;`,
      filename: file("src/foo.ts"),
      options: OPTS,
    },
    {
      // it.each`table`(...) — the callee is a TaggedTemplateExpression; the
      // spec links this file at L1 via a `../`-relative href that resolves to
      // the repo-root-relative key `tests/tagged.test.ts`.
      code: 'it.each`\n  n\n  ${1}\n`("adds %s", () => {});',
      filename: file("tests/tagged.test.ts"),
      options: OPTS,
    },
    {
      // the correct anchor of a titled link, a short label linking by span, and
      // a validated-by link followed by a second trailing parenthetical
      code: TITLED_TESTS.replace(
        '  it("adds numbers", () => {\n    expect(1 + 1).toBe(2);\n  });\n  it("subtracts numbers"',
        '  const sum = (a, b) =>\n    a + b;\n\n  it("adds numbers"',
      ),
      filename: file("tests/titled.test.ts"),
      options: OPTS,
    },
  ],
  invalid: [
    {
      // "adds numbers" is named by a link whose L5 anchor lands in "subtracts
      // numbers": the link counts for neither, and both are reported
      code: TITLED_TESTS,
      filename: file("tests/titled.test.ts"),
      options: OPTS,
      errors: [
        {
          messageId: "misanchoredLink",
          line: 2,
          data: {
            name: "adds numbers",
            spec: "specs/titled/spec.md",
            anchor: "5",
            line: "2",
          },
        },
        {
          messageId: "unlinkedTest",
          line: 5,
          data: {
            name: "subtracts numbers",
            file: "tests/titled.test.ts",
            line: "5",
            roots: ROOTS,
          },
        },
      ],
    },
    {
      // linked test file, but this it() sits on line 1 (the link points at line 2)
      code: `it("works", () => {});`,
      filename: file("tests/linked.test.ts"),
      options: OPTS,
      errors: [
        {
          messageId: "unlinkedTest",
          data: {
            name: "works",
            file: "tests/linked.test.ts",
            line: "1",
            roots: ROOTS,
          },
        },
      ],
    },
    {
      // test file no spec/adr references at all — every it() is flagged
      code: `it("a", () => {});\nit("b", () => {});`,
      filename: file("tests/orphan.test.ts"),
      options: OPTS,
      errors: [
        {
          messageId: "unlinkedTest",
          data: {
            name: "a",
            file: "tests/orphan.test.ts",
            line: "1",
            roots: ROOTS,
          },
        },
        {
          messageId: "unlinkedTest",
          data: {
            name: "b",
            file: "tests/orphan.test.ts",
            line: "2",
            roots: ROOTS,
          },
        },
      ],
    },
    {
      // test.each — exercises the chained-callee traversal in rootCallName
      code: `test.each([[1]])("case %s", () => {});`,
      filename: file("tests/orphan.test.ts"),
      options: OPTS,
      errors: [
        {
          messageId: "unlinkedTest",
          data: {
            name: "case %s",
            file: "tests/orphan.test.ts",
            line: "1",
            roots: ROOTS,
          },
        },
      ],
    },
    {
      // it.each`table`(...) with no link — the tagged-template callee must not
      // let the test escape the rule (regression guard for the TaggedTemplate arm)
      code: 'it.each`\n  n\n  ${1}\n`("case", () => {});',
      filename: file("tests/orphan.test.ts"),
      options: OPTS,
      errors: [
        {
          messageId: "unlinkedTest",
          data: {
            name: "case",
            file: "tests/orphan.test.ts",
            line: "1",
            roots: ROOTS,
          },
        },
      ],
    },
    {
      // a .spec.ts file is a test file too (isTestFile), so it is enforced
      code: `it("x", () => {});`,
      filename: file("tests/orphan.spec.ts"),
      options: OPTS,
      errors: [
        {
          messageId: "unlinkedTest",
          data: {
            name: "x",
            file: "tests/orphan.spec.ts",
            line: "1",
            roots: ROOTS,
          },
        },
      ],
    },
  ],
});
