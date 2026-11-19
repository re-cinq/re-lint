import { RuleTester } from "eslint";
import rule from "./require-refusal-test.mjs";

const ruleTester = new RuleTester();
const filename = "/repo/src/app/api/x/route.test.ts";
const inTest = (body) => `it("t", async () => { ${body} });`;
const okTest = inTest(`expect(res.status).toBe(200);`);

ruleTester.run("require-refusal-test", rule, {
  valid: [
    { code: `${okTest}\n${inTest(`expect(res.status).toBe(403);`)}` },
    { code: inTest(`await expect(p).rejects.toThrow(new Error("x"));`) },
    { code: inTest(`expect(fn).toThrow("denied");`) },
    { code: inTest(`expect(fn).toThrowError(RangeError);`) },
    { code: inTest(`await expect(p).rejects.toBeInstanceOf(Denied);`) },
    { code: inTest(`expect(res).toEqual({ status: 404, body: {} });`) },
    { code: inTest(`expect(res).toMatchObject({ statusCode: 401 });`) },
    { code: inTest(`expect(res.status).toEqual(500);`) },
    {
      code: inTest(`expectRefused(res);`),
      options: [{ refusalMatchers: ["expectRefused"] }],
    },
    {
      code: inTest(`expect(res).toBeRefused();`),
      options: [{ refusalMatchers: ["toBeRefused"] }],
    },
    { code: `const x = 1;` },
    { code: `expect(res.status).toBe(200);` },
  ].map((testCase) => ({ filename, ...testCase })),
  invalid: [
    { code: okTest },
    { code: inTest(`expect(res.status).toBe(399);`) },
    { code: inTest(`expect(res.status).toBe(600);`) },
    { code: inTest(`expect(fn).toThrow();`) },
    { code: inTest(`expect(res).toEqual({ status: 200 });`) },
    { code: `expect(res.status).toBe(403);\n${okTest}`, line: 2 },
    { code: inTest(`expectRefused(res);`) },
    { code: `${okTest}\n${okTest}`, line: 1 },
  ].map(({ code, line = 1 }) => ({
    filename,
    code,
    errors: [{ messageId: "noRefusal", line }],
  })),
});
