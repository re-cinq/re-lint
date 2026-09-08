import { RuleTester } from "eslint";
import rule from "./no-closing-brace-comments.mjs";

const ruleTester = new RuleTester();

ruleTester.run("no-closing-brace-comments", rule, {
  valid: [
    `if (a) {\n  work();\n}`,
    // a comment on its own line after the block is not a marker
    `if (a) {\n  work();\n}\n// next section`,
    // a comment after any other token is not this rule's business
    `function f() {\n  return; // why\n}`,
    `const total = sum(items); // includes tax`,
    `work(); // called once`,
    // a comment before the brace is a body comment
    `if (a) {\n  work(); // the work\n}`,
    `/* leading */ if (a) { work(); }`,
    // a one-line block needs no marker, so a trailing comment describes it
    `if (a) { work(); } // guard`,
    // eslint directives after a brace are linter instructions
    `if (a) { work(); } // eslint-disable-line no-undef`,
    { code: `describe("x", () => {\n  it("y", () => {});\n});`, options: [{}] },
  ],
  invalid: [
    {
      code: `if (a) {\n  work();\n} // end if`,
      errors: [{ messageId: "closingBraceComment", line: 3 }],
    },
    {
      code: `describe("x", () => {\n  work();\n}); // end describe`,
      errors: [{ messageId: "closingBraceComment" }],
    },
    {
      code: `function f() {\n  work();\n} /* end f */`,
      errors: [{ messageId: "closingBraceComment" }],
    },
    // the statement's semicolon does not hide the brace
    {
      code: `const point = {\n  x: 1,\n}; // point`,
      errors: [{ messageId: "closingBraceComment" }],
    },
    {
      code: `for (const item of items) {\n  if (item) {\n    work();\n  } // end if\n} // end for`,
      errors: [
        { messageId: "closingBraceComment", line: 4 },
        { messageId: "closingBraceComment", line: 5 },
      ],
    },
    {
      code: `work(a, (b) => {\n  rest(b);\n}) // callback`,
      errors: [{ messageId: "closingBraceComment" }],
    },
  ],
});
