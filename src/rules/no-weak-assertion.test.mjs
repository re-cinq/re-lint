import { RuleTester } from "eslint";
import rule from "./no-weak-assertion.mjs";

const ruleTester = new RuleTester();
const filename = "/repo/src/x.test.ts";

const weak = (matcher) => [{ messageId: "weakAssertion", data: { matcher } }];

ruleTester.run("no-weak-assertion", rule, {
  valid: [
    // the query names the element, so its presence is the value
    {
      code: 'it("shows the date", async () => { expect(screen.getByText("2026-06-23")).toBeTruthy(); expect(await screen.findByRole("dialog")).toBeTruthy(); expect(container.querySelector("[data-flush]")).not.toBeNull(); });',
      filename: "/repo/src/x.test.ts",
    },
    // the value is pinned elsewhere in the same test
    `it("lists", () => { expect(rows).toHaveLength(2); expect(rows).toEqual([{ id: 1 }, { id: 2 }]); });`,
    `it("finds", () => { expect(found).toBeDefined(); expect(found).toMatchObject({ id: 1 }); });`,
    `it("sizes", () => { expect(rows.length).toBe(3); expect(rows).toContainEqual({ id: 1 }); });`,
    `it("named", () => { expect(typeof id).toBe("string"); expect(id).toBe("abc"); });`,
    `it("throws", () => { expect(run).toThrow(new Error("no")); expect(run).toBeDefined(); });`,
    // an empty result is a full value check
    `it("empty", () => { expect(rows).toHaveLength(0); });`,
    `it("empty length", () => { expect(rows.length).toBe(0); });`,
    // a boolean already
    `it("allowed", () => { expect(isAllowed(x)).toBeTruthy(); });`,
    `it("has", () => { expect(hasAccess).toBeFalsy(); });`,
    `it("can", () => { expect(user.canEdit()).toBeTruthy(); });`,
    // not assertions
    `it("counts", () => { expect.assertions(1); expect.hasAssertions(); });`,
    // outside any test is not this rule's business
    `function check(rows) { expect(rows).toHaveLength(2); }`,
    // a strong matcher
    `it("adds", () => { expect(add(1, 2)).toBe(3); });`,
    {
      code: `it("klass", () => { expect(err).toBeInstanceOf(Error); });`,
      filename,
      options: [{ allow: ["toBeInstanceOf"] }],
    },
  ].map((test) => (typeof test === "string" ? { code: test, filename } : test)),
  invalid: [
    {
      code: `it("lists", () => { expect(rows).toHaveLength(2); });`,
      filename,
      errors: weak("toHaveLength"),
    },
    {
      code: `it("length", () => { expect(rows.length).toBe(3); });`,
      filename,
      errors: weak(".length"),
    },
    {
      code: `it("length", () => { expect(rows.length).toEqual(3); });`,
      filename,
      errors: weak(".length"),
    },
    {
      code: `it("defined", () => { expect(result).toBeDefined(); });`,
      filename,
      errors: weak("toBeDefined"),
    },
    {
      code: `it("not undefined", () => { expect(result).not.toBeUndefined(); });`,
      filename,
      errors: weak("toBeUndefined"),
    },
    {
      code: `it("not null", () => { expect(result).not.toBeNull(); });`,
      filename,
      errors: weak("toBeNull"),
    },
    {
      code: `it("truthy", () => { expect(res).toBeTruthy(); });`,
      filename,
      errors: weak("toBeTruthy"),
    },
    {
      code: `it("falsy", () => { expect(issue).toBeFalsy(); });`,
      filename,
      errors: weak("toBeFalsy"),
    },
    {
      code: `it("instance", () => { expect(err).toBeInstanceOf(Error); });`,
      filename,
      errors: weak("toBeInstanceOf"),
    },
    {
      code: `it("type", () => { expect(typeof id).toBe("string"); });`,
      filename,
      errors: weak("typeof"),
    },
    {
      code: `it("count", () => { expect(count).toBeGreaterThan(0); });`,
      filename,
      errors: weak("toBeGreaterThan"),
    },
    {
      code: `it("count", () => { expect(count).toBeGreaterThanOrEqual(1); });`,
      filename,
      errors: weak("toBeGreaterThanOrEqual"),
    },
    {
      code: `it("resolves", async () => { await expect(p).resolves.toBeDefined(); });`,
      filename,
      errors: weak("toBeDefined"),
    },
    {
      code: `it("rejects", async () => { await expect(p).rejects.toBeInstanceOf(Error); });`,
      filename,
      errors: weak("toBeInstanceOf"),
    },
    {
      code: `test.each([[1]])("row", (n) => { expect(n).toBeTruthy(); });`,
      filename,
      errors: weak("toBeTruthy"),
    },
    // a different subject pinned does not excuse this one
    {
      code: `it("other", () => { expect(rows).toHaveLength(2); expect(other).toEqual([]); });`,
      filename,
      errors: weak("toHaveLength"),
    },
    // a matcher outside the allow list is still reported
    {
      code: `it("defined", () => { expect(result).toBeDefined(); });`,
      filename,
      options: [{ allow: ["toBeInstanceOf"] }],
      errors: weak("toBeDefined"),
    },
  ],
});
