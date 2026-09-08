import { RuleTester } from "eslint";
import rule from "./no-nondeterministic-tests.mjs";

const ruleTester = new RuleTester();

const TEST_FILE = "/repo/src/clock.test.ts";
const SPEC_FILE = "/repo/src/clock.spec.mjs";
const SOURCE_FILE = "/repo/src/clock.ts";

ruleTester.run("no-nondeterministic-tests", rule, {
  valid: [
    // a fixed date is a value, not a clock read
    {
      code: `it("parses", () => { expect(parse(new Date("2026-01-01"))).toBe(1); });`,
      filename: TEST_FILE,
    },
    // fake timers tame the whole time family, wherever in the file they sit
    {
      code: `beforeEach(() => { vi.useFakeTimers(); }); it("ticks", () => { expect(Date.now()).toBe(0); });`,
      filename: TEST_FILE,
    },
    {
      code: `it("ticks", () => { const at = new Date(); expect(at).toBeDefined(); }); afterAll(() => { jest.setSystemTime(0); });`,
      filename: TEST_FILE,
    },
    {
      code: `jest.useFakeTimers(); it("measures", () => { expect(performance.now()).toBe(0); });`,
      filename: SPEC_FILE,
    },
    {
      code: `vi.spyOn(Math, "random").mockReturnValue(0.5); it("rolls", () => { expect(Math.random()).toBe(0.5); });`,
      filename: TEST_FILE,
    },
    {
      code: `vi.mock("node:crypto"); it("ids", () => { expect(crypto.randomUUID()).toBe("x"); });`,
      filename: TEST_FILE,
    },
    {
      code: `jest.mock("crypto"); it("ids", () => { expect(crypto.randomUUID()).toBe("x"); });`,
      filename: TEST_FILE,
    },
    // not a test file: production code reading the clock is out of scope
    {
      code: `export const stamp = () => Date.now() + Math.random();`,
      filename: SOURCE_FILE,
    },
    // options object accepted (no keys today)
    {
      code: `it("adds", () => { expect(1 + 1).toBe(2); });`,
      filename: TEST_FILE,
      options: [{}],
    },
  ],
  invalid: [
    {
      code: `it("rolls", () => { expect(pick(Math.random())).toBeDefined(); });`,
      filename: TEST_FILE,
      errors: [
        { messageId: "nondeterministic", data: { call: "Math.random()" } },
      ],
    },
    {
      code: `it("stamps", () => { expect(stamp(Date.now())).toBeDefined(); });`,
      filename: TEST_FILE,
      errors: [{ messageId: "nondeterministic", data: { call: "Date.now()" } }],
    },
    {
      code: `test("ages", () => { expect(age(new Date())).toBeGreaterThan(0); });`,
      filename: SPEC_FILE,
      errors: [{ messageId: "nondeterministic", data: { call: "new Date()" } }],
    },
    {
      code: `it("measures", () => { const start = performance.now(); expect(start).toBeDefined(); });`,
      filename: TEST_FILE,
      errors: [
        { messageId: "nondeterministic", data: { call: "performance.now()" } },
      ],
    },
    {
      code: `it("ids", () => { expect(crypto.randomUUID()).toMatch(/-/); });`,
      filename: TEST_FILE,
      errors: [
        {
          messageId: "nondeterministic",
          data: { call: "crypto.randomUUID()" },
        },
      ],
    },
    // taming one category leaves the others reported
    {
      code: `vi.useFakeTimers(); it("mixed", () => { expect(seed(Date.now(), Math.random())).toBeDefined(); });`,
      filename: TEST_FILE,
      errors: [
        { messageId: "nondeterministic", data: { call: "Math.random()" } },
      ],
    },
    // spying on a different Math method does not tame random
    {
      code: `vi.spyOn(Math, "floor"); it("rolls", () => { expect(Math.random()).toBeDefined(); });`,
      filename: TEST_FILE,
      errors: [
        { messageId: "nondeterministic", data: { call: "Math.random()" } },
      ],
    },
    // mocking an unrelated module does not tame randomUUID
    {
      code: `vi.mock("./ids"); it("ids", () => { expect(crypto.randomUUID()).toBeDefined(); });`,
      filename: TEST_FILE,
      errors: [
        {
          messageId: "nondeterministic",
          data: { call: "crypto.randomUUID()" },
        },
      ],
    },
    {
      code: `it("twice", () => { expect(pair(Date.now(), new Date())).toBeDefined(); });`,
      filename: TEST_FILE,
      options: [{}],
      errors: [
        { messageId: "nondeterministic", data: { call: "Date.now()" } },
        { messageId: "nondeterministic", data: { call: "new Date()" } },
      ],
    },
  ],
});
