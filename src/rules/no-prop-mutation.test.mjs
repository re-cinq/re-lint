import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-prop-mutation.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const COMPONENT = "/repo/src/app/pools/PoolsView.tsx";

ruleTester.run("no-prop-mutation", rule, {
  valid: [
    // reading a prop is fine (data down)
    {
      code: `function PoolsView({ items }: { items: number[] }) { return items.map((x) => x + 1); }`,
      filename: COMPONENT,
    },
    // sending a change up via a callback prop is the sanctioned path (actions up)
    {
      code: `function Row({ id, onSelect }: any) { return onSelect(id); }`,
      filename: COMPONENT,
    },
    // copy first, then mutate the local copy — not the prop
    {
      code: `function PoolsView({ items }: any) { const copy = [...items]; copy.sort(); return copy; }`,
      filename: COMPONENT,
    },
    // mutating a local (non-prop) variable is fine
    {
      code: `function PoolsView() { const acc: number[] = []; acc.push(1); return acc; }`,
      filename: COMPONENT,
    },
    // a non-component (camelCase) helper mutating its argument is out of scope
    {
      code: `function collect(list: number[]) { list.push(1); return list; }`,
      filename: COMPONENT,
    },
    // a forwardRef's second argument is not props
    {
      code: `const Input = React.forwardRef(function Input(props: any, ref: any) { ref.current = 1; return null; });`,
      filename: COMPONENT,
    },
  ],
  invalid: [
    // mutating array method on a destructured prop
    {
      code: `function PoolsView({ items }: any) { items.push(1); return items; }`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
    // no path gate: any file the consumer scopes the rule to is checked
    {
      code: `function PoolsView({ items }: any) { items.push(1); return items; }`,
      filename: "/repo/packages/widgets/src/thing.tsx",
      errors: [{ messageId: "propMutation" }],
    },
    // assigning through the props object
    {
      code: `function PoolsView(props: any) { props.count = 5; return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
    // in-place sort of a prop
    {
      code: `const List = ({ rows }: any) => { rows.sort(); return rows; };`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
    // update expression on a prop member
    {
      code: `function PoolsView(props: any) { props.count++; return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
    // delete on a prop member
    {
      code: `function PoolsView(props: any) { delete props.x; return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
    // reassigning a destructured prop binding
    {
      code: `function PoolsView({ items }: any) { items = []; return items; }`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
    // nested-member mutating call on the props object
    {
      code: `function PoolsView(props: any) { props.data.push(1); return null; }`,
      filename: COMPONENT,
      errors: [{ messageId: "propMutation" }],
    },
  ],
});
