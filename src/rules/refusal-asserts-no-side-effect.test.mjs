import { RuleTester } from "eslint";
import rule from "./refusal-asserts-no-side-effect.mjs";

const ruleTester = new RuleTester();
const filename = "/repo/src/x.test.ts";
const named = (name, body) => `it("${name}", async () => { ${body} });`;
const refusal = (body) => named("refuses a caller outside the project", body);
const unchecked = (name) => ({
  filename,
  code: named(name, `expect(res.status).toBe(403);`),
  errors: [{ messageId: "noEffectChecked", data: { name } }],
});

ruleTester.run("refusal-asserts-no-side-effect", rule, {
  valid: [
    // an upstream that rejects is not the code refusing
    named(
      "handles several thinking blocks in one chunk",
      `expect(parts).toEqual(["a", "b"]);`,
    ),
    named(
      "renders nothing when the fetch rejects",
      `expect(screen.queryByText("x")).toBeNull();`,
    ),
    refusal(
      `expect(res.status).toBe(403); expect(cancelTask).not.toHaveBeenCalled();`,
    ),
    refusal(`expect(cancelTask).not.toHaveBeenCalledWith("t1");`),
    refusal(`expect(cancelTask).not.toHaveBeenLastCalledWith("t1");`),
    refusal(`expect(cancelTask).toHaveBeenCalledTimes(0);`),
    refusal(`expect(writes).toHaveLength(0);`),
    refusal(`expect(writes).toEqual([]);`),
    refusal(`expect(writes).toStrictEqual([]);`),
    refusal(`expect(calls.length).toBe(0);`),
    refusal(`expect(writeCount).toEqual(0);`),
    refusal(`expect(store.size).toBe(0);`),
    named(
      "answers 403 to a made-up session",
      `expect(res).toEqual({ status: 403, served: [], leaks: [] });`,
    ),
    named("rejects a wrong type", `expect(write).toHaveBeenCalledTimes(0);`),
    named("lists two rows", `expect(rows).toHaveLength(2);`),
    named("returns 200 for a member", `expect(res.status).toBe(200);`),
    named(
      "denies a stranger",
      `expect(res).toMatchObject({ status: 403, writes: 0 });`,
    ),
    named("denies a stranger", `expectNothingWritten(store);`),
    named("denies a stranger", `helpers.expectNothingWritten(store);`),
    `it(\`refuses \${who}\`, () => { expect(res.status).toBe(403); });`,
    `it.each(rows)("refuses %s", (row) => { expect(write).not.toHaveBeenCalled(); });`,
    `it("refuses", () => { expect(res.status).toBe(403); });`.replace(
      "refuses",
      "lists",
    ),
    `function check() { expect(res.status).toBe(403); }`,
  ].map((code) => ({
    filename,
    code,
    options: code.includes("expectNothingWritten")
      ? [{ noEffectMatchers: ["expectNothingWritten"] }]
      : [],
  })),
  invalid: [
    unchecked("refuses a caller outside the project"),
    unchecked("answers 404 for an unknown run"),
    unchecked("returns 403 without a token"),
    unchecked("responds with 401 when no cookie"),
    {
      filename,
      code: `it.each(rows)("refuses %s", (row) => { expect(res.status).toBe(403); });`,
      errors: [{ messageId: "noEffectChecked", data: { name: "refuses %s" } }],
    },
    {
      filename,
      code: named(
        "refuses a stranger",
        `expect(writes).toHaveLength(2); expect(count).toBe(1); expect(res).toEqual({ status: 403, served: [1] });`,
      ),
      errors: [{ messageId: "noEffectChecked" }],
    },
    {
      filename,
      code: named("refuses a stranger", `expect(res.status).toBe(403);`),
      options: [{ noEffectMatchers: ["expectNothingWritten"] }],
      errors: [{ messageId: "noEffectChecked" }],
    },
    {
      filename,
      code: named("denies a stranger", `expect(res.status).toBe(403);`),
      options: [{ pattern: "^denies" }],
      errors: [{ messageId: "noEffectChecked" }],
    },
  ],
});

ruleTester.run("refusal-asserts-no-side-effect custom pattern", rule, {
  valid: [
    {
      filename,
      code: named("refuses a stranger", `expect(res.status).toBe(403);`),
      options: [{ pattern: "^denies" }],
    },
    {
      filename,
      code: named("denies a stranger", `expect(write).not.toHaveBeenCalled();`),
      options: [{ pattern: "^denies" }],
    },
  ],
  invalid: [],
});
