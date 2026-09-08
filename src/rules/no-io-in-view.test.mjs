import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-io-in-view.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const VIEW = "/repo/src/app/tasks/[id]/PRStatusCard.tsx";
const PANEL = "/repo/src/app/tasks/[id]/PRStatusPanel.tsx";
const DATA_LAYER = [{ dataModules: ["@/lib/db", "@/lib/github"] }];

ruleTester.run("no-io-in-view", rule, {
  valid: [
    // a pure view: props in, JSX out, only components + built-ins
    {
      code: `import Icon from "@/components/Icon"; export default function PRStatusCard({ status }: { status: string }) { return <Icon name={status} />; }`,
      filename: VIEW,
      options: DATA_LAYER,
    },
    // pure helpers, types and CSS modules are not the outside world
    {
      code: `import { isCancellable } from "@/lib/task-status"; import styles from "./x.module.css"; export default function StatusCard() { return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
    },
    // type-only imports are erased at compile time — not runtime IO
    {
      code: `import type { DBRow } from "@/lib/db"; export default function PRStatusCard({ row }: { row: DBRow }) { return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
    },
    // the same IO in a container (not a view suffix) is exactly where it belongs
    {
      code: `import { query } from "@/lib/db"; export default async function PRStatusPanel() { await fetch("/api/x"); return null; }`,
      filename: PANEL,
      options: DATA_LAYER,
    },
    // test files are skipped even when they stub fetch
    {
      code: `function ThingView() { fetch("/api/x"); return null; }`,
      filename: "/repo/src/app/tasks/ThingView.test.tsx",
      options: DATA_LAYER,
    },
    // with no dataModules configured the rule reports nothing, not even fetch
    {
      code: `import { query } from "@/lib/db"; export default function PRStatusCard() { fetch("/api/x"); return null; }`,
      filename: VIEW,
    },
    {
      code: `import { query } from "@/lib/db"; export default function PRStatusCard() { fetch("/api/x"); return null; }`,
      filename: VIEW,
      options: [{ dataModules: [] }],
    },
    // a custom viewSuffixes list replaces the default, so Card is no longer a view
    {
      code: `export default function PRStatusCard() { fetch("/api/x"); return null; }`,
      filename: VIEW,
      options: [{ dataModules: ["@/lib/db"], viewSuffixes: ["Widget"] }],
    },
  ],
  invalid: [
    // the data layer
    {
      code: `import { query } from "@/lib/db"; export default function PRStatusCard() { return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "ioImportInView" }],
    },
    // a second configured data module
    {
      code: `import { getPRDetails } from "@/lib/github"; export default function PRStatusCard() { return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "ioImportInView" }],
    },
    // a server-action module (actions flow down as props, never imported)
    {
      code: `import { submitFeedback } from "./actions"; export default function PRStatusCard() { return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "ioImportInView" }],
    },
    // a custom viewSuffixes entry makes Widget files views
    {
      code: `import { query } from "@/lib/db"; export default function StatusWidget() { return null; }`,
      filename: "/repo/src/app/StatusWidget.tsx",
      options: [{ dataModules: ["@/lib/db"], viewSuffixes: ["Widget"] }],
      errors: [{ messageId: "ioImportInView" }],
    },
    // raw fetch
    {
      code: `export default function PRStatusCard() { fetch("/api/x"); return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    // window.fetch is still fetch
    {
      code: `export default function PRStatusCard() { window.fetch("/api/x"); return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    // globalThis.fetch and self.fetch are still fetch
    {
      code: `export default function PRStatusCard() { globalThis.fetch("/api/x"); return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    {
      code: `export default function PRStatusCard() { self.fetch("/api/x"); return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    // websocket / eventsource / xhr
    {
      code: `export default function PRStatusCard() { const s = new WebSocket("wss://x"); return s ? null : null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    {
      code: `export default function PRStatusCard() { const s = new EventSource("/api/x"); return s ? null : null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    {
      code: `export default function PRStatusCard() { const s = new XMLHttpRequest(); return s ? null : null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    // navigator.sendBeacon
    {
      code: `export default function PRStatusCard() { navigator.sendBeacon("/api/x"); return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "networkCallInView" }],
    },
    // dynamic import of the data layer
    {
      code: `export default async function PRStatusCard() { await import("@/lib/db"); return null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "ioImportInView" }],
    },
    // require of the data layer
    {
      code: `export default function PRStatusCard() { const db = require("@/lib/db"); return db ? null : null; }`,
      filename: VIEW,
      options: DATA_LAYER,
      errors: [{ messageId: "ioImportInView" }],
    },
  ],
});
