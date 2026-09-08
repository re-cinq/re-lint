import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./default-export-matches-filename.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const VIEW = "/repo/src/components/StatusBadge.tsx";
const PAGE = "/repo/src/app/repos/[owner]/[repo]/features/page.tsx";
const ROUTE = "/repo/src/app/api/repos/[owner]/[repo]/route.ts";

ruleTester.run("default-export-matches-filename", rule, {
  valid: [
    // the convention: grepping the component's name finds its file
    { code: `export default function StatusBadge() { return null; }`, filename: VIEW },
    // memo/forwardRef wrappers still name the component
    { code: `import { memo } from "react"; function StatusBadge() { return null; } export default memo(StatusBadge);`, filename: VIEW },
    // a reserved Next file that only re-exports, plus route-segment config it MUST
    // declare literally (a re-exported `dynamic` is not reliably picked up)
    {
      code: `export const dynamic = "force-dynamic"; export { default } from "./FeaturesPage";`,
      filename: PAGE,
    },
    // route.ts has named handlers and no default export — nothing to enforce
    { code: `export async function GET() { return null; }`, filename: ROUTE },
    // a declaration file is not a component module
    {
      code: `export default function nope() {}`,
      filename: "/repo/src/types/global.d.ts",
    },
    // a test file is not a component module
    {
      code: `export default function nope() {}`,
      filename: "/repo/src/components/StatusBadge.test.tsx",
    },
    // no default export at all
    { code: `export const helper = 1;`, filename: VIEW },
    // `reserved: "off"` silences the page rule during a staged migration
    {
      code: `export default function RepoFeatures() { return null; }`,
      filename: PAGE,
      options: [{ reserved: "off" }],
    },
  ],
  invalid: [
    {
      code: `export default function Badge() { return null; }`,
      filename: VIEW,
      errors: [{ messageId: "nameMismatch" }],
    },
    {
      // no path gate: any file the consumer scopes the rule to is checked
      code: `export default function whateverName() {}`,
      filename: "/repo/packages/jobs/src/merge/merge-check.ts",
      errors: [{ messageId: "nameMismatch" }],
    },
    {
      // `reserved: "error"` is the explicit default
      code: `export default function RepoFeatures() { return null; }`,
      filename: PAGE,
      options: [{ reserved: "error" }],
      errors: [{ messageId: "reservedInlineDefault" }],
    },
    {
      // an anonymous default cannot be found by any name
      code: `export default () => null;`,
      filename: VIEW,
      errors: [{ messageId: "unnamedDefault" }],
    },
    {
      code: `import { memo } from "react"; function Badge() { return null; } export default memo(Badge);`,
      filename: VIEW,
      errors: [{ messageId: "nameMismatch" }],
    },
    {
      // the component is declared inline in page.tsx, so its name is unfindable
      code: `export default function RepoFeatures() { return null; }`,
      filename: PAGE,
      errors: [{ messageId: "reservedInlineDefault" }],
    },
    {
      // re-exports AND declares — the component still lives here
      code: `function Extra() { return null; } export { default } from "./FeaturesPage";`,
      filename: PAGE,
      errors: [{ messageId: "reservedNotPureReexport" }],
    },
  ],
});
