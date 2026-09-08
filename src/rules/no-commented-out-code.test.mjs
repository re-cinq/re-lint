import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-commented-out-code.mjs";

const ruleTester = new RuleTester();
const tsRuleTester = new RuleTester({ languageOptions: { parser: tsParser } });

ruleTester.run("no-commented-out-code", rule, {
  valid: [
    `// the pool is lazy because initPool() must run first\nwork();`,
    `/* retries are capped at three (see ADR-019) */\nwork();`,
    // a bare word or literal that parses as an expression is prose, not code
    `// done\nwork();`,
    `// 42\nwork();`,
    `work(); // TODO(bogdan): handle the retry = path`,
    `// FIXME: the callback (below) drops errors\nwork();`,
    `/* eslint-disable no-console */\nconsole.log(1);`,
    `// @ts-expect-error legacy shape\nwork();`,
    `/* istanbul ignore next */\nwork();`,
    `/** @param {string} name = the caller's name */\nfunction greet(name) { return name; }`,
    // prose with a code-shaped character but no code
    `// merges (b) into a when a = stale\nwork();`,
    // the option object is accepted, if empty
    { code: `// runs once per tick; never twice\nwork();`, options: [{}] },
  ],
  invalid: [
    {
      code: `// work();\nrest();`,
      errors: [{ messageId: "commentedOutCode", line: 1 }],
    },
    {
      code: `// const total = items.length;\nrest();`,
      errors: [{ messageId: "commentedOutCode" }],
    },
    {
      code: `/* if (ready) { start(); } */\nrest();`,
      errors: [{ messageId: "commentedOutCode" }],
    },
    // a consecutive run of line comments is one candidate, one report
    {
      code: `// function old() {\n//   return 1;\n// }\nrest();`,
      errors: [{ messageId: "commentedOutCode", line: 1 }],
    },
    // two runs separated by code are two reports
    {
      code: `// work();\nrest();\n// stop();\nrest();`,
      errors: [
        { messageId: "commentedOutCode", line: 1 },
        { messageId: "commentedOutCode", line: 3 },
      ],
    },
    {
      code: `rest(); // import { a } from "./a.js";`,
      errors: [{ messageId: "commentedOutCode" }],
    },
  ],
});

tsRuleTester.run("no-commented-out-code (typescript)", rule, {
  valid: [
    {
      code: `// the port is typed as Store; see the models folder\nwork();`,
      filename: "/repo/src/store.ts",
    },
    // TypeScript-only syntax in a .js file is not tried against the TS parser
    {
      code: `// const total: number = 3;\nwork();`,
      filename: "/repo/src/store.js",
    },
  ],
  invalid: [
    {
      code: `// const total: number = 3;\nwork();`,
      filename: "/repo/src/store.ts",
      errors: [{ messageId: "commentedOutCode" }],
    },
    {
      code: `// interface Store { name: string; }\nwork();`,
      filename: "/repo/src/store.tsx",
      errors: [{ messageId: "commentedOutCode" }],
    },
  ],
});
