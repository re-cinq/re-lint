import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./max-member-chain.mjs";

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

ruleTester.run("max-member-chain", rule, {
  valid: [
    // two hops is the default ceiling
    `const city = order.customer.city;`,
    `order.customer.notify();`,
    // a call in the middle is still one hop per member
    `const name = repo.owner().name;`,
    // `this` roots are the object's own structure
    `class C { run() { return this.config.db.host.length; } }`,
    // well-known globals are namespaces, not collaborators
    `const n = Math.max.apply(null, list);`,
    `process.env.HOME.trim();`,
    `JSON.parse(text).items.length;`,
    // fluent chains: every hop after the root is a call
    `builder().withA().withB().withC();`,
    `query.where(a).orderBy(b).limit(c).run();`,
    // import.meta is a language feature, not a collaborator
    `const dir = import.meta.url.pathname.length;`,
    // allowRoots extends the exemption list
    {
      code: `const v = config.server.db.host;`,
      options: [{ allowRoots: ["config"] }],
    },
    // max raises the ceiling
    {
      code: `const v = order.customer.address.city;`,
      options: [{ max: 3 }],
    },
  ],
  invalid: [
    // reported once, at the outermost member expression
    {
      code: `const city = order.customer.address.city;`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: { chain: "order.customer.address.city", depth: "3", max: "2" },
          column: 14,
        },
      ],
    },
    // calls in the chain still count as member hops
    {
      code: `order.customer().address.city.trim();`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: {
            chain: "order.customer().address.city.trim",
            depth: "4",
            max: "2",
          },
        },
      ],
    },
    // computed hops count
    {
      code: `const v = rows[0].cells[1].value;`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: { chain: "rows[0].cells[1].value", depth: "4", max: "2" },
        },
      ],
    },
    // optional hops count
    {
      code: `const v = order?.customer?.address?.city;`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: {
            chain: "order?.customer?.address?.city",
            depth: "3",
            max: "2",
          },
        },
      ],
    },
    // a fluent prefix with a plain property at the end is not fluent
    {
      code: `const v = builder().withA().withB().result;`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: {
            chain: "builder().withA().withB().result",
            depth: "3",
            max: "2",
          },
        },
      ],
    },
    // TS non-null assertions do not hide hops
    {
      code: `const v = order!.customer!.address!.city;`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: {
            chain: "order!.customer!.address!.city",
            depth: "3",
            max: "2",
          },
        },
      ],
    },
    // max lowers the ceiling
    {
      code: `const v = order.customer.city;`,
      options: [{ max: 1 }],
      errors: [
        {
          messageId: "chainTooDeep",
          data: { chain: "order.customer.city", depth: "2", max: "1" },
        },
      ],
    },
    // allowRoots is additive; unlisted roots are still checked
    {
      code: `const v = order.customer.address.city;`,
      options: [{ allowRoots: ["config"] }],
      errors: [{ messageId: "chainTooDeep" }],
    },
    // long chains are truncated in the message
    {
      code: `const v = veryLongRootObjectName.someProperty.anotherProperty.yetAnotherProperty.finalProperty;`,
      errors: [
        {
          messageId: "chainTooDeep",
          data: {
            chain:
              "veryLongRootObjectName.someProperty.anotherProperty.yetAn...",
            depth: "4",
            max: "2",
          },
        },
      ],
    },
  ],
});
