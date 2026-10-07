import { RuleTester } from "eslint";
import rule from "./no-nested-if.mjs";

const ruleTester = new RuleTester();
const nested = [{ messageId: "nestedIf" }];

ruleTester.run("no-nested-if", rule, {
  valid: [
    `if (a) { work(); }`,
    `if (a) { work(); } else { rest(); }`,
    // else-if chains sit at one level, not inside each other
    `if (a) { one(); } else if (b) { two(); } else if (c) { three(); }`,
    // a function boundary resets the nesting count
    `if (a) { items.map((item) => { if (item.ok) { return item; } }); }`,
    `if (a) { const pick = () => { if (b) { return 1; } }; }`,
    `function outer() { if (a) { work(); } } function other() { if (b) { rest(); } }`,
    // sibling ifs in one block are sequential guards, not nesting
    `function guards() { if (!a) { return; } if (!b) { return; } work(); }`,
    `class C { static { if (a) { init(); } } }`,
  ],
  invalid: [
    {
      code: `if (a) { if (b) { work(); } }`,
      errors: nested,
      output: `if (a && b) { work(); }`,
    },
    {
      code: `if (a) if (b) work();`,
      errors: nested,
      output: `if (a && b) work();`,
    },
    {
      code: `if (a) { if (b) work(); }`,
      errors: nested,
      output: `if (a && b) work();`,
    },
    // operands that bind looser than && keep their meaning inside parens
    {
      code: `if (a || b) { if (c ? d : e) { work(); } }`,
      errors: nested,
      output: `if ((a || b) && (c ? d : e)) { work(); }`,
    },
    {
      code: `if (a && b) { if (c && d) { work(); } }`,
      errors: nested,
      output: `if (a && b && c && d) { work(); }`,
    },
    // an else-if arm whose only body is an if merges inside the arm
    {
      code: `if (a) { one(); } else if (b) { if (c) { two(); } }`,
      errors: nested,
      output: `if (a) { one(); } else if (b && c) { two(); }`,
    },
    // two levels deep: the first pass merges the outer pair, the second pair waits for the next pass
    {
      code: `if (a) { if (b) { if (c) { work(); } } }`,
      errors: [{ messageId: "nestedIf" }, { messageId: "nestedIf" }],
      output: `if (a && b) { if (c) { work(); } }`,
    },
    // a sibling statement means the inner if is not the whole body
    {
      code: `if (a) { prepare(); if (b) { work(); } }`,
      errors: nested,
      output: null,
    },
    {
      code: `if (a) { if (b) { work(); } rest(); }`,
      errors: nested,
      output: null,
    },
    // an else on either if changes what the merge would mean
    {
      code: `if (a) { if (b) { work(); } else { other(); } }`,
      errors: nested,
      output: null,
    },
    {
      code: `if (a) { if (b) { work(); } } else { other(); }`,
      errors: nested,
      output: null,
    },
    // a comment between the pieces would be lost
    {
      code: `if (a) { // why a\n  if (b) { work(); } }`,
      errors: nested,
      output: null,
    },
    {
      code: `if (a) { if (b) { work(); } // why\n}`,
      errors: nested,
      output: null,
    },
    // a comment inside the inner body travels with it
    {
      code: `if (a) { if (b) { // why b\n work(); } }`,
      errors: nested,
      output: `if (a && b) { // why b\n work(); }`,
    },
    {
      code: `if (a) { while (b) { if (c) { work(); } } }`,
      errors: nested,
      output: null,
    },
    {
      code: `if (a) { one(); } else { if (b) { two(); } three(); }`,
      errors: nested,
      output: null,
    },
    {
      code: `function f() { if (a) { try { risky(); } catch { if (b) { recover(); } } } }`,
      errors: nested,
      output: null,
    },
  ],
});
