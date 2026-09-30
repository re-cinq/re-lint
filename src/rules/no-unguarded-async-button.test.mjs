import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-unguarded-async-button.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const VIEW = "/repo/src/components/SaveButton.tsx";

const hintless = { element: "button", hint: "" };

ruleTester.run("no-unguarded-async-button", rule, {
  valid: [
    // a synchronous click starts nothing a second click could repeat
    {
      code: `const A = () => <button type="button" onClick={() => setOpen(true)}>Open</button>;`,
      filename: VIEW,
    },
    {
      code: `const A = (p: { pending: boolean }) => <button type="submit" disabled={p.pending}>Save</button>;`,
      filename: VIEW,
    },
    // a bare `disabled` is always disabled, so never double-clicked
    {
      code: `const A = () => <button type="submit" disabled>Save</button>;`,
      filename: VIEW,
    },
    {
      code: `const A = (p: { busy: boolean }) => <button onClick={async () => save()} disabled={p.busy}>Save</button>;`,
      filename: VIEW,
    },
    // a spread may carry `disabled`; the rule cannot see inside it
    {
      code: `const A = (p: object) => <button type="submit" {...p}>Save</button>;`,
      filename: VIEW,
    },
    // a computed type and an opaque handler say nothing about async work
    {
      code: `const A = (p: { type: "button" | "submit"; onClick: () => void }) => <button type={p.type} onClick={p.onClick}>Go</button>;`,
      filename: VIEW,
    },
    {
      code: `const A = (p: { onSave: () => Promise<void> }) => <button onClick={p.onSave}>Save</button>;`,
      filename: VIEW,
    },
    // a synchronous arrow calling an async function: the promise is invisible here
    {
      code: `async function save() {}\nconst A = () => <button onClick={() => save()}>Save</button>;`,
      filename: VIEW,
    },
    {
      code: `function handle() {}\nconst A = () => <button onClick={handle}>Go</button>;`,
      filename: VIEW,
    },
    {
      code: `const A = () => { const handle = useCallback(() => {}, []); return <button onClick={handle}>Go</button>; };`,
      filename: VIEW,
    },
    // only the elements the consumer names are buttons to this rule
    {
      code: `const A = () => <Button onClick={async () => save()}>Save</Button>;`,
      filename: VIEW,
    },
    {
      code: `const A = () => <a href="#" onClick={async () => save()}>Save</a>;`,
      filename: VIEW,
    },
    {
      code: `const A = () => <input type="submit" />;`,
      filename: VIEW,
    },
  ],
  invalid: [
    {
      code: `const A = () => <button type="submit">Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "submitUnguarded", data: hintless }],
    },
    {
      code: `const A = () => <button type={"submit"}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "submitUnguarded", data: hintless }],
    },
    // an absent guard wearing the key
    {
      code: `const A = () => <button type="submit" disabled={false}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "submitUnguarded", data: hintless }],
    },
    {
      code: `const A = () => <button type="button" onClick={async () => { await save(); }}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "asyncUnguarded", data: hintless }],
    },
    {
      code: `const A = () => <button onClick={async function () { await save(); }}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "asyncUnguarded", data: hintless }],
    },
    {
      code: `async function handle() { await save(); }\nconst A = () => <button onClick={handle}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "asyncUnguarded", data: hintless }],
    },
    {
      code: `const handle = async () => { await save(); };\nconst A = () => <button onClick={handle}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "asyncUnguarded", data: hintless }],
    },
    {
      code: `const A = () => { const handle = useCallback(async () => { await save(); }, []); return <button onClick={handle}>Save</button>; };`,
      filename: VIEW,
      errors: [{ messageId: "asyncUnguarded", data: hintless }],
    },
    // aria-disabled announces a state; it stops no click
    {
      code: `const A = (p: { busy: boolean }) => <button onClick={async () => save()} aria-disabled={p.busy}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "asyncUnguarded", data: hintless }],
    },
    // one button, one report: the submit is the request a second click repeats
    {
      code: `const A = () => <button type="submit" onClick={async () => save()}>Save</button>;`,
      filename: VIEW,
      errors: [{ messageId: "submitUnguarded", data: hintless }],
    },
    {
      code: `const A = () => <Button onClick={async () => save()}>Save</Button>;`,
      filename: VIEW,
      options: [{ components: ["Button"] }],
      errors: [
        { messageId: "asyncUnguarded", data: { element: "Button", hint: "" } },
      ],
    },
    {
      code: `const A = () => <Button type="submit">Save</Button>;`,
      filename: VIEW,
      options: [{ components: ["Button"] }],
      errors: [
        { messageId: "submitUnguarded", data: { element: "Button", hint: "" } },
      ],
    },
    {
      code: `const A = () => <button onClick={async () => save()}>Save</button>;`,
      filename: VIEW,
      options: [{ pendingComponent: "PendingButton" }],
      errors: [
        {
          messageId: "asyncUnguarded",
          data: {
            element: "button",
            hint: " — or use <PendingButton>, which owns it",
          },
        },
      ],
    },
    {
      code: `const A = () => <button type="submit">Save</button>;`,
      filename: VIEW,
      options: [{ submitComponent: "SubmitButton" }],
      errors: [
        {
          messageId: "submitUnguarded",
          data: {
            element: "button",
            hint: " — or use <SubmitButton>, which owns it",
          },
        },
      ],
    },
  ],
});
