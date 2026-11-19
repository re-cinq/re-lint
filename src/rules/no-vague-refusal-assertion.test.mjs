import { RuleTester } from "eslint";
import rule from "./no-vague-refusal-assertion.mjs";

const ruleTester = new RuleTester();
const filename = "/repo/src/x.test.ts";
const inTest = (body) => `it("refuses", async () => { ${body} });`;
const vague = (found) => [{ messageId: "vagueRefusal", data: { found } }];

ruleTester.run("no-vague-refusal-assertion", rule, {
  valid: [
    // not.toThrow() says nothing was thrown: that is an exact claim
    inTest(`expect(() => parse(raw)).not.toThrow();`),
    inTest(`expect(fn).toThrow("Unknown tool");`),
    inTest(`expect(fn).toThrow(new Error("x"));`),
    inTest(`expect(fn).toThrow(RangeError);`),
    inTest(`await expect(p).rejects.toBeInstanceOf(RepoAccessDenied);`),
    inTest(`await expect(p).rejects.toThrow(new Error("denied"));`),
    inTest(`expect(res.status).not.toBe(403);`),
    inTest(`expect(res.status).toBe(403);`),
    inTest(`expect(res.status).toEqual(200);`),
    inTest(`expect(count).toBeGreaterThanOrEqual(400);`),
    inTest(`expect(res.status).toBeGreaterThanOrEqual(minimum);`),
    inTest(`expect(res.ok).toBe(true);`),
    `expect(fn).toThrow();`,
    `function check() { expect(fn).toThrow(); }`,
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: inTest(`expect(fn).toThrow();`),
      found: "toThrow() with no argument",
    },
    {
      code: inTest(`expect(fn).toThrowError();`),
      found: "toThrowError() with no argument",
    },
    {
      code: inTest(`await expect(p).rejects.toThrow();`),
      found: "toThrow() with no argument",
    },
    {
      code: inTest(`await expect(p).rejects.toThrowError();`),
      found: "toThrowError() with no argument",
    },
    {
      code: inTest(`await expect(p).rejects.toBeInstanceOf(Error);`),
      found: "rejects.toBeInstanceOf(Error)",
    },
    {
      code: inTest(`await expect(p).rejects.toBeDefined();`),
      found: "rejects.toBeDefined()",
    },
    {
      code: inTest(`await expect(p).rejects.toBeTruthy();`),
      found: "rejects.toBeTruthy()",
    },
    {
      code: inTest(`expect(res.status).not.toBe(200);`),
      found: "not.toBe(200)",
    },
    {
      code: inTest(`expect(res.status).not.toEqual(204);`),
      found: "not.toEqual(204)",
    },
    {
      code: inTest(`expect(res.status).toBeGreaterThanOrEqual(400);`),
      found: "status >= 400",
    },
    {
      code: inTest(`expect(res.status).toBeGreaterThan(399);`),
      found: "status >= 400",
    },
    {
      code: inTest(`expect(res.statusCode).toBeGreaterThanOrEqual(500);`),
      found: "status >= 400",
    },
    {
      code: inTest(`expect(error.code).toBeGreaterThanOrEqual(400);`),
      found: "status >= 400",
    },
    { code: inTest(`expect(res.ok).toBe(false);`), found: "ok is false" },
    { code: inTest(`expect(res.ok).toBeFalsy();`), found: "ok is false" },
    {
      code: `test.each([1])("n", async () => { expect(fn).toThrow(); });`,
      found: "toThrow() with no argument",
    },
  ].map(({ code, found }) => ({ filename, code, errors: vague(found) })),
});
