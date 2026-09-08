import { RuleTester } from "eslint";
import rule from "./callee-below-caller.mjs";

const ruleTester = new RuleTester();

ruleTester.run("callee-below-caller", rule, {
  valid: [
    // caller above, callee below — the downward direction
    `function main() { return helper(); } function helper() { return 1; }`,
    // a three-deep chain that reads top to bottom
    `function a() { return b(); } function b() { return c(); } function c() { return 3; }`,
    // exported functions are entry points and sit at the top by default
    `export function api() { return inner(); } function inner() { return 1; }`,
    // a callee referenced at module level is an entry point, not a helper
    `function setup() { return 1; } const ready = setup(); function later() { return setup(); }`,
    // an export statement counts as a module-level reference
    `function util() { return 1; } export { util }; function user() { return util(); }`,
    // mutual recursion has no downward order
    `function even(n) { return n === 0 || odd(n - 1); } function odd(n) { return n !== 0 && even(n - 1); }`,
    // self-recursion is not a caller relationship
    `function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }`,
    // several callers: judged against the first one in source order
    `function first() { return shared(); } function shared() { return 1; } function second() { return shared(); }`,
    // nested (non top-level) function declarations are out of scope
    `function outer() { function inner() { return 1; } return inner(); }`,
    // unreferenced function is left alone
    `function lonely() { return 1; } function other() { return 2; }`,
    // exportedFirst false still accepts an exported callee that sits below
    {
      code: `function main() { return helper(); } export function helper() { return 1; }`,
      options: [{ exportedFirst: false }],
    },
  ],
  invalid: [
    {
      code: `function helper() { return 1; } function main() { return helper(); }`,
      errors: [
        {
          messageId: "calleeAboveCaller",
          data: { callee: "helper", caller: "main" },
        },
      ],
    },
    // a reference that is not a call (passed as a value) still binds the caller
    {
      code: `function pick(item) { return item; } function run(items) { return items.map(pick); }`,
      errors: [{ messageId: "calleeAboveCaller" }],
    },
    // the first caller in source order decides, even when a later caller sits above
    {
      code: `function shared() { return 1; } function first() { return shared(); } function second() { return shared(); }`,
      errors: [
        {
          messageId: "calleeAboveCaller",
          data: { callee: "shared", caller: "first" },
        },
      ],
    },
    // two helpers above their caller: two reports
    {
      code: `function a() { return 1; } function b() { return 2; } function main() { return a() + b(); }`,
      errors: [
        { messageId: "calleeAboveCaller" },
        { messageId: "calleeAboveCaller" },
      ],
    },
    // an exported caller does not exempt a non-exported callee above it
    {
      code: `function inner() { return 1; } export function api() { return inner(); }`,
      errors: [
        {
          messageId: "calleeAboveCaller",
          data: { callee: "inner", caller: "api" },
        },
      ],
    },
    // with exportedFirst off, an exported helper above its caller is reported
    {
      code: `export function helper() { return 1; } function main() { return helper(); }`,
      options: [{ exportedFirst: false }],
      errors: [
        {
          messageId: "calleeAboveCaller",
          data: { callee: "helper", caller: "main" },
        },
      ],
    },
    // a reference inside a nested callback still belongs to the enclosing top-level function
    {
      code: `function format(x) { return x; } function render(list) { return list.map((x) => format(x)); }`,
      errors: [{ messageId: "calleeAboveCaller" }],
    },
  ],
});
