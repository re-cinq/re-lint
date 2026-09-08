import { RuleTester } from "eslint";
import rule from "./prefer-polymorphism.mjs";

const ruleTester = new RuleTester();

ruleTester.run("prefer-polymorphism", rule, {
  valid: [
    // two cases is a branch, not a dispatch table
    `switch (node.type) { case "a": one(); break; case "b": two(); break; }`,
    // a bare identifier is local enum dispatch, not an object's tag
    `switch (mode) { case "a": one(); break; case "b": two(); break; case "c": three(); break; }`,
    // default arms do not count toward the threshold
    `switch (node.type) { case "a": one(); break; case "b": two(); break; default: rest(); }`,
    // two equality tests on the same member is fine
    `if (node.type === "a") { one(); } else if (node.type === "b") { two(); }`,
    // three tests on DIFFERENT members are separate questions, not a dispatch
    `if (node.type === "a") { one(); } else if (node.kind === "b") { two(); } else if (node.flag === "c") { three(); }`,
    // non-equality comparisons are not dispatch
    `if (item.size > 1) { one(); } else if (item.size > 2) { two(); } else if (item.size > 3) { three(); }`,
    // identifiers compared to literals are local enum dispatch
    `if (mode === "a") { one(); } else if (mode === "b") { two(); } else if (mode === "c") { three(); }`,
    // discriminants option narrows the rule to listed property names
    {
      code: `switch (node.status) { case "a": one(); break; case "b": two(); break; case "c": three(); break; }`,
      options: [{ discriminants: ["type", "kind"] }],
    },
    {
      code: `if (node.status === "a") { one(); } else if (node.status === "b") { two(); } else if (node.status === "c") { three(); }`,
      options: [{ discriminants: ["type", "kind"] }],
    },
    // minCases raises the threshold
    {
      code: `switch (node.type) { case "a": one(); break; case "b": two(); break; case "c": three(); break; }`,
      options: [{ minCases: 4 }],
    },
  ],
  invalid: [
    {
      code: `switch (node.type) { case "a": one(); break; case "b": two(); break; case "c": three(); break; }`,
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "3", discriminant: "node.type" },
        },
      ],
    },
    {
      code: `switch (this.kind) { case 1: one(); break; case 2: two(); break; case 3: three(); break; default: rest(); }`,
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "3", discriminant: "this.kind" },
        },
      ],
    },
    // reported once, at the chain head
    {
      code: `if (node.type === "a") { one(); } else if (node.type === "b") { two(); } else if (node.type === "c") { three(); } else { rest(); }`,
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "3", discriminant: "node.type" },
          column: 1,
        },
      ],
    },
    // loose equality and yoda order count too
    {
      code: `if ("a" == event.kind) { one(); } else if (event.kind == "b") { two(); } else if (event.kind == "c") { three(); }`,
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "3", discriminant: "event.kind" },
        },
      ],
    },
    // an unrelated test in the middle does not break the chain count
    {
      code: `if (n.type === "a") { one(); } else if (other) { two(); } else if (n.type === "b") { three(); } else if (n.type === "c") { four(); }`,
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "3", discriminant: "n.type" },
        },
      ],
    },
    // discriminants option still catches a listed property
    {
      code: `switch (node.kind) { case "a": one(); break; case "b": two(); break; case "c": three(); break; }`,
      options: [{ discriminants: ["type", "kind"] }],
      errors: [{ messageId: "preferPolymorphism" }],
    },
    // minCases lowers the threshold
    {
      code: `if (node.type === "a") { one(); } else if (node.type === "b") { two(); }`,
      options: [{ minCases: 2 }],
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "2", discriminant: "node.type" },
        },
      ],
    },
    // nested member expression as discriminant
    {
      code: `switch (event.payload.type) { case "a": one(); break; case "b": two(); break; case "c": three(); break; }`,
      errors: [
        {
          messageId: "preferPolymorphism",
          data: { count: "3", discriminant: "event.payload.type" },
        },
      ],
    },
  ],
});
