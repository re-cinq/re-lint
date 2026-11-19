import { RuleTester } from "eslint";
import rule from "./no-guard-mock-always-allows.mjs";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const FILE = "/repo/src/app/api/x/route.test.ts";
const ACCESS = "@/lib/user-repo-access";
const GUARDS = [{ module: ACCESS }];
const ALWAYS_TRUE_FACTORY = `
vi.mock("${ACCESS}", () => ({
  userCanAccessRepo: vi.fn().mockResolvedValue(true),
}));
`;
const ALWAYS_TRUE_AUTOMOCK = `
vi.mock("${ACCESS}");
beforeEach(() => vi.mocked(userCanAccessRepo).mockResolvedValue(true));
`;

const alwaysAllows = (module) => ({
  messageId: "alwaysAllows",
  data: { module },
});

ruleTester.run("no-guard-mock-always-allows", rule, {
  valid: [
    // a later test makes the guard refuse once: the denial path is covered
    {
      code: `${ALWAYS_TRUE_AUTOMOCK}
it("returns 403 when no access", () => {
  userCanAccessRepo.mockResolvedValueOnce(false);
});`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // a rejection is a denial too
    {
      code: `${ALWAYS_TRUE_AUTOMOCK}
it("returns 500 when check fails", () => {
  userCanAccessRepo.mockRejectedValue(new Error("down"));
});`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // an object answer that says allowed: false is a denial
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("refuses", () => {
  check.mockResolvedValue({ allowed: false });
});`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // a status of 400 or more in the answer is a denial
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("refuses", () => {
  check.mockReturnValue({ status: 403 });
});`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // an implementation that throws is a denial
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("refuses", () => {
  check.mockImplementationOnce(() => { throw new Error("no"); });
});`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // an implementation that returns false is a denial
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("refuses", () => {
  check.mockImplementation(async () => false);
});`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // a listed helper name counts as a denial
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("refuses", () => {
  denyAccess();
});`,
      filename: FILE,
      options: [{ guards: GUARDS, deny: ["denyAccess"] }],
    },
    // a module that is not a guard is ignored
    {
      code: `vi.mock("@/lib/clock", () => ({ now: vi.fn().mockReturnValue(1) }));`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // a guard that is imported but not mocked is ignored
    {
      code: `import { userCanAccessRepo } from "${ACCESS}";`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // specifiers match exactly
    {
      code: `vi.mock("${ACCESS}/extra");`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
    // a true answer in an object is not a denial but a false elsewhere in an unrelated call is no denial either
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("x", () => { check.mockResolvedValue({ allowed: true }); setFlag(false); });
it("refuses", () => { check.mockResolvedValue({ ok: false }); });`,
      filename: FILE,
      options: [{ guards: GUARDS }],
    },
  ],
  invalid: [
    {
      code: ALWAYS_TRUE_FACTORY,
      filename: FILE,
      options: [{ guards: GUARDS }],
      errors: [alwaysAllows(ACCESS)],
    },
    {
      code: ALWAYS_TRUE_AUTOMOCK,
      filename: FILE,
      options: [{ guards: GUARDS }],
      errors: [alwaysAllows(ACCESS)],
    },
    // jest and doMock forms count
    {
      code: `jest.mock("${ACCESS}", () => ({ f: jest.fn().mockReturnValue(true) }));`,
      filename: FILE,
      options: [{ guards: GUARDS }],
      errors: [alwaysAllows(ACCESS)],
    },
    {
      code: `vi.doMock("${ACCESS}");`,
      filename: FILE,
      options: [{ guards: GUARDS }],
      errors: [alwaysAllows(ACCESS)],
    },
    // an allowing answer and an unrelated false are no denial
    {
      code: `${ALWAYS_TRUE_FACTORY}
it("x", () => { check.mockResolvedValue({ allowed: true }); setFlag(false); });
it("y", () => { check.mockReturnValue({ status: 200 }); });`,
      filename: FILE,
      options: [{ guards: GUARDS }],
      errors: [alwaysAllows(ACCESS)],
    },
    // two guards mocked, a denial anywhere in the file covers neither separately: one error per module when none refuses
    {
      code: `vi.mock("${ACCESS}");
vi.mock("@/lib/session");`,
      filename: FILE,
      options: [{ guards: [...GUARDS, { module: "@/lib/session" }] }],
      errors: [alwaysAllows(ACCESS), alwaysAllows("@/lib/session")],
    },
    // a denial on one guard's own import leaves the other guard unrefused
    {
      code: `import { userCanAccessRepo } from "${ACCESS}";
vi.mock("${ACCESS}");
vi.mock("@/lib/session");
it("refuses", () => {
  vi.mocked(userCanAccessRepo).mockResolvedValueOnce(false);
});`,
      filename: FILE,
      options: [{ guards: [...GUARDS, { module: "@/lib/session" }] }],
      errors: [alwaysAllows("@/lib/session")],
    },
    // a module mocked twice is reported once
    {
      code: `vi.mock("${ACCESS}");
vi.doMock("${ACCESS}");`,
      filename: FILE,
      options: [{ guards: GUARDS }],
      errors: [alwaysAllows(ACCESS)],
    },
  ],
});
