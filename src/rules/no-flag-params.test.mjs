import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-flag-params.mjs";

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

ruleTester.run("no-flag-params", rule, {
  valid: [
    // an assertion states what the value is; the boolean is not a switch
    `expect(ok).toBe(true);`,
    `expect(ok).toBe(false);`,
    `expect(result.ok).toEqual(true);`,
    `expect(fn()).not.toBe(true);`,
    `await expect(run()).resolves.toBe(false);`,
    `expect(vi.mocked(fn)).toHaveReturnedWith(true);`,
    `function render(items: string[]) { return items.length; }`,
    `function render(items, count = 0) { return items.slice(count); }`,
    // a boolean computed at the call site is data, not a literal switch
    `render(items, isCompact);`,
    `render(items, count > 3);`,
    `const pick = (value: string | undefined) => value ?? "";`,
    `new Widget(name, { size: 3 });`,
    // named via destructuring: reads at the call site (allowNamed default)
    `function save({ force }: { force: boolean }) { return force; }`,
    `save({ force: true });`,
    `function save({ force = false } = {}) { return force; }`,
    `class Store { constructor(private readonly path: string) {} }`,
    {
      code: `function save({ force }: { force: boolean }) { return force; }`,
      options: [{ allowNamed: true }],
    },
    // a stored value, not a behaviour switch: React hands back the setter, so
    // there is no second function for the caller to reach for
    `const [open, setOpen] = useState(false);`,
    `const seen = useRef(true);`,
    `setSidebarOpen(false);`,
    `drawer.setSidebarOpen(true);`,
  ],
  invalid: [
    {
      code: `function render(items: string[], compact: boolean) { return compact ? 1 : items.length; }`,
      errors: [{ messageId: "flagParam", data: { name: "compact" } }],
    },
    {
      code: `function render(items: string[], compact: boolean | undefined) { return compact; }`,
      errors: [{ messageId: "flagParam", data: { name: "compact" } }],
    },
    {
      code: `function render(items: string[], compact?: boolean) { return compact; }`,
      errors: [{ messageId: "flagParam", data: { name: "compact" } }],
    },
    {
      code: `function render(items, compact = false) { return compact; }`,
      errors: [{ messageId: "flagParam", data: { name: "compact" } }],
    },
    {
      code: `const render = (compact: boolean = true) => compact;`,
      errors: [{ messageId: "flagParam", data: { name: "compact" } }],
    },
    {
      code: `class Store { constructor(private readonly strict: boolean) {} }`,
      errors: [{ messageId: "flagParam", data: { name: "strict" } }],
    },
    {
      code: `declare function render(compact: boolean): void;`,
      errors: [{ messageId: "flagParam", data: { name: "compact" } }],
    },
    {
      code: `render(items, true);`,
      errors: [{ messageId: "flagArgument" }],
    },
    {
      code: `new Widget(name, false);`,
      errors: [{ messageId: "flagArgument" }],
    },
    {
      code: `render(true, false);`,
      errors: [{ messageId: "flagArgument" }, { messageId: "flagArgument" }],
    },
    // allowNamed: false reports destructured params and object-literal flags too
    {
      code: `function save({ force }: { force: boolean }) { return force; }`,
      options: [{ allowNamed: false }],
      errors: [{ messageId: "flagParam", data: { name: "force" } }],
    },
    {
      code: `function save({ force = false } = {}) { return force; }`,
      options: [{ allowNamed: false }],
      errors: [{ messageId: "flagParam", data: { name: "force" } }],
    },
    {
      code: `save({ force: true, name: "x" });`,
      options: [{ allowNamed: false }],
      errors: [{ messageId: "flagArgument" }],
    },
    // a setter taking more than the value IS selecting a behaviour
    {
      code: `setPaused(agent.id, true);`,
      errors: [{ messageId: "flagArgument" }],
    },
  ],
});
