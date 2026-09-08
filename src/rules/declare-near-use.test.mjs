import { RuleTester } from "eslint";
import rule from "./declare-near-use.mjs";

const ruleTester = new RuleTester();

// six statements of filler — one more than the default maxDistance of 5
const SIX = `a(); b(); c(); d(); e(); f();`;
const FIVE = `a(); b(); c(); d(); e();`;

ruleTester.run("declare-near-use", rule, {
  valid: [
    // used right away
    `function run() { const x = 1; use(x); }`,
    // exactly maxDistance statements between is still fine
    `function run() { const x = 1; ${FIVE} use(x); }`,
    // first use inside a nested block: hoisting into the arm is a judgment call
    `function run() { const x = 1; ${SIX} if (a) { use(x); } }`,
    // first use inside a callback
    `function run() { const x = 1; ${SIX} items.map((i) => i + x); }`,
    // shared between two branching siblings
    `function run() { const x = 1; ${SIX} if (a) { use(x); } try { use(x); } catch {} }`,
    // uninitialised let is declared for later assignment on purpose
    `function run() { let x; ${SIX} x = 2; use(x); }`,
    // var is hoisted anyway and out of scope
    `function run() { var x = 1; ${SIX} use(x); }`,
    // exported program-level declarations are referenced by the export
    `export const x = 1; ${SIX} use(x);`,
    // unreferenced declaration is left alone
    `function run() { const x = 1; ${SIX} }`,
    // a larger maxDistance accepts the gap
    {
      code: `function run() { const x = 1; ${SIX} use(x); }`,
      options: [{ maxDistance: 6 }],
    },
  ],
  invalid: [
    {
      code: `function run() { const x = 1; ${SIX} use(x); }`,
      errors: [
        {
          messageId: "declaredTooEarly",
          data: { name: "x", distance: 6, maxDistance: 5 },
        },
      ],
    },
    // let with an initialiser is a candidate
    {
      code: `function run() { let x = 1; ${SIX} x = x + 1; }`,
      errors: [{ messageId: "declaredTooEarly" }],
    },
    // Program-level, not exported
    {
      code: `const x = 1; ${SIX} use(x);`,
      errors: [{ messageId: "declaredTooEarly" }],
    },
    // a use in the test of an if at the same level is not nested
    {
      code: `function run() { const x = 1; ${SIX} if (x) { go(); } }`,
      errors: [{ messageId: "declaredTooEarly" }],
    },
    // first use decides: a later use in a nested block does not rescue it
    {
      code: `function run() { const x = 1; ${SIX} use(x); if (a) { use(x); } }`,
      errors: [{ messageId: "declaredTooEarly" }],
    },
    // a tighter maxDistance reports a shorter gap
    {
      code: `function run() { const x = 1; a(); b(); use(x); }`,
      options: [{ maxDistance: 1 }],
      errors: [
        {
          messageId: "declaredTooEarly",
          data: { name: "x", distance: 2, maxDistance: 1 },
        },
      ],
    },
    // a nested block's own declaration list is judged too
    {
      code: `function run() { if (a) { const x = 1; ${SIX} use(x); } }`,
      errors: [{ messageId: "declaredTooEarly" }],
    },
  ],
});
