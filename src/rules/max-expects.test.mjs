import { RuleTester } from "eslint";
import rule from "./max-expects.mjs";

const ruleTester = new RuleTester();

ruleTester.run("max-expects", rule, {
  valid: [
    `it("adds", () => { expect(add(1, 2)).toBe(3); });`,
    // one chain is one assertion however long it gets
    `it("resolves", async () => { await expect(load()).resolves.toEqual({ id: 1 }); });`,
    // expect.assertions / hasAssertions are bookkeeping, not assertions
    `it("throws", async () => { expect.assertions(1); await expect(fail()).rejects.toThrow(new Error("no")); });`,
    `test("has", () => { expect.hasAssertions(); expect(list()).toHaveLength(2); });`,
    // one assertion each across siblings
    `describe("math", () => { it("adds", () => { expect(add(1, 1)).toBe(2); }); it("subs", () => { expect(sub(2, 1)).toBe(1); }); });`,
    `it.each([[1, 2, 3]])("adds %i + %i", (a, b, sum) => { expect(add(a, b)).toBe(sum); });`,
    // expect outside any test callback is not this rule's business
    `function assertShape(value) { expect(value).toMatchObject({ ok: true }); expect(value.id).toBeDefined(); }`,
    {
      code: `it("two", () => { expect(a).toBe(1); expect(b).toBe(2); });`,
      options: [{ max: 2 }],
    },
  ],
  invalid: [
    {
      code: `it("two", () => { expect(a).toBe(1); expect(b).toBe(2); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 2, max: 1 } }],
    },
    {
      code: `test("three", async () => { expect(a).toBe(1); await expect(p).resolves.toBe(2); expect(c).toEqual({}); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 3, max: 1 } }],
    },
    {
      code: `it.only("focused", () => { expect(a).toBe(1); expect(b).toBe(2); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 2, max: 1 } }],
    },
    {
      code: `test.skip("skipped", () => { expect(a).toBe(1); expect(b).toBe(2); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 2, max: 1 } }],
    },
    {
      code: `it.each([[1]])("row %i", (n) => { expect(n).toBe(1); expect(n).not.toBe(2); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 2, max: 1 } }],
    },
    // a helper closure inside the test body still counts toward the test
    {
      code: `it("hidden", () => { const check = (v) => { expect(v.a).toBe(1); expect(v.b).toBe(2); }; check(run()); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 2, max: 1 } }],
    },
    // expect.assertions is free, the two real assertions are not
    {
      code: `it("counted", () => { expect.assertions(2); expect(a).toBe(1); expect(b).toBe(2); });`,
      errors: [{ messageId: "tooManyExpects", data: { count: 2, max: 1 } }],
    },
    {
      code: `it("three", () => { expect(a).toBe(1); expect(b).toBe(2); expect(c).toBe(3); });`,
      options: [{ max: 2 }],
      errors: [{ messageId: "tooManyExpects", data: { count: 3, max: 2 } }],
    },
  ],
});
