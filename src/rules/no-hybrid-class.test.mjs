import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-hybrid-class.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-hybrid-class", rule, {
  valid: [
    // plain data type: fields only
    `class Point { x = 0; y = 0; }`,
    // object: methods with hidden state
    `class Counter { #count = 0; increment() { this.#count += 1; } }`,
    `class Counter { private count = 0; increment() { this.count += 1; } }`,
    `class Counter { protected count = 0; increment() { this.count += 1; } }`,
    // readonly fields are not mutable
    `class Money { readonly amount = 0; add(other: Money) { return other; } }`,
    // accessors hide fields; they are not counted as methods
    `class Box { private w = 0; get width() { return this.w; } set width(v: number) { this.w = v; } }`,
    // static fields belong to the class, not the instance
    `class Registry { static items = []; register(item: string) { return item; } }`,
    // declare fields carry no runtime state
    `class Shape { declare kind: string; area() { return 0; } }`,
    // a constructor alone is not a method
    `class Point { x: number; constructor(x: number) { this.x = x; } }`,
    // private / readonly parameter properties are hidden
    `class Service { constructor(private readonly db: string, readonly name: string) {} run() { return this.db; } }`,
    // decorated classes are framework entities by default
    `@Entity() class User { name = ""; greet() { return this.name; } }`,
  ],
  invalid: [
    {
      code: `class User { name = ""; greet() { return this.name; } }`,
      errors: [
        {
          messageId: "hybridClass",
          data: { name: "User", fields: 1, methods: 1 },
        },
      ],
    },
    // an explicit public field
    {
      code: `class User { public name = ""; greet() { return this.name; } }`,
      errors: [{ messageId: "hybridClass" }],
    },
    // a public constructor parameter property is a public field
    {
      code: `class User { constructor(public name: string) {} greet() { return this.name; } }`,
      errors: [
        {
          messageId: "hybridClass",
          data: { name: "User", fields: 1, methods: 1 },
        },
      ],
    },
    // counts every field and method
    {
      code: `class Cart { items: string[] = []; total = 0; add(i: string) { this.items.push(i); } clear() { this.items = []; } }`,
      errors: [
        {
          messageId: "hybridClass",
          data: { name: "Cart", fields: 2, methods: 2 },
        },
      ],
    },
    // class expressions are named after their binding
    {
      code: `const Thing = class { value = 1; read() { return this.value; } };`,
      errors: [
        {
          messageId: "hybridClass",
          data: { name: "Thing", fields: 1, methods: 1 },
        },
      ],
    },
    // one hidden field does not excuse a public one
    {
      code: `class Mixed { #secret = 1; open = 2; peek() { return this.#secret; } }`,
      errors: [
        {
          messageId: "hybridClass",
          data: { name: "Mixed", fields: 1, methods: 1 },
        },
      ],
    },
    // with ignoreDecorated off, decorated classes are judged too
    {
      code: `@Entity() class User { name = ""; greet() { return this.name; } }`,
      options: [{ ignoreDecorated: false }],
      errors: [{ messageId: "hybridClass" }],
    },
  ],
});
