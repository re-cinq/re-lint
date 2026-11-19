import { RuleTester } from "eslint";
import rule from "./no-stub-answers-everything.mjs";

const ruleTester = new RuleTester();
const filename = "/repo/src/x.test.ts";
const alwaysAnswers = [{ messageId: "alwaysAnswers" }];

ruleTester.run("no-stub-answers-everything", rule, {
  valid: [
    // a fake made with vi.fn that rejects counts, whatever it is named
    `vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); it("x", () => { const mock = vi.fn(() => Promise.reject(new Error("down"))); });`,
    `it("a", () => { vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); });
     it("b", () => { vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 }))); });`,
    `vi.stubGlobal("fetch", async (url) => { if (url === "/down") { throw new Error("down"); } return new Response("{}"); });`,
    `vi.stubGlobal("fetch", vi.fn(async () => Response.error()));`,
    `vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));`,
    `function fetchStub() { throw new Error("x"); }
     globalThis.fetch = async () => new Response("[]");`,
    `vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
     vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("down"));`,
    `jest.spyOn(window, "fetch").mockResolvedValue({ ok: false });`,
    `global.fetch = vi.fn(); mockFetch.mockRejectedValue(new Error("x"));`,
    `it("a", () => { expect(1).toBe(1); });`,
    `vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); respondWith({ status: 401 });`,
    `vi.stubGlobal("other", 1);`,
  ].map((code) => ({ filename, code })),
  invalid: [
    `vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));`,
    `globalThis.fetch = async () => new Response("[]");`,
    `global.fetch = vi.fn();`,
    `vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));`,
    `jest.spyOn(window, "fetch").mockResolvedValue(new Response("{}"));`,
    `vi.stubGlobal("fetch", vi.fn()); respondWith({ status: 200 }); respondWith({ status: code });`,
    `vi.stubGlobal("fetch", vi.fn()); function helper() { throw new Error("x"); }`,
  ].map((code) => ({ filename, code, errors: alwaysAnswers })),
});

ruleTester.run("no-stub-answers-everything reports once", rule, {
  valid: [],
  invalid: [
    {
      filename,
      code: `vi.stubGlobal("fetch", vi.fn()); globalThis.fetch = vi.fn();`,
      errors: alwaysAnswers,
    },
  ],
});
