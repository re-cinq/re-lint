import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import markdown from "@eslint/markdown";
import rule from "./require-status-matches-coverage.mjs";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test-fixtures",
  "require-status-matches-coverage",
);

const grounded = (testCase) => ({
  ...testCase,
  options: [{ specsRoot: FIXTURES, ...testCase.options?.[0] }],
});

const ruleTester = new RuleTester({
  plugins: { markdown },
  language: "markdown/gfm",
});

const LINK = "([validated by](payments.test.ts#L10))";

// Intro prose under the H1 anchors `buildIntroOrdinals` to the H1, so the two
// requirement sentences land on lines 11 and 13 as testable statements. The
// status row sits on line 7.
const spec = (status) =>
  [
    "# My Feature", // 1
    "", // 2
    "Intro paragraph describing the feature.", // 3
    "", // 4
    "| Field | Value |", // 5
    "|---|---|", // 6
    `| Status | ${status} |`, // 7
    "", // 8
    "## Functional Requirements", // 9
    "", // 10
    "The system returns a receipt for every payment.", // 11
    "", // 12
    "The system emails the receipt to the payer.", // 13
  ].join("\n");

const linkFirst = (content) =>
  content.replace("for every payment.", `for every payment. ${LINK}`);
const linkSecond = (content) =>
  content.replace("to the payer.", `to the payer. ${LINK}`);
const linkBoth = (content) => linkSecond(linkFirst(content));

const adr = (status) =>
  [
    "---", // 1
    `status: ${status}`, // 2
    "---", // 3
    "", // 4
    "# ADR-1 Retry policy", // 5
    "", // 6
    "Context for this decision.", // 7
    "", // 8
    "## Behavior", // 9
    "", // 10
    "The gateway retries failed requests three times.", // 11
  ].join("\n");

const linkAdr = (content) =>
  content.replace("three times.", `three times. ${LINK}`);

// Every non-intro statement sits under a narrative heading — no testable
// statement, so no tier is derivable and the doc is left alone.
const specNarrativeOnly = [
  "# My Feature",
  "",
  "Intro paragraph describing the feature.",
  "",
  "| Field | Value |",
  "|---|---|",
  "| Status | Shipped |",
  "",
  "## Rationale",
  "",
  "We chose receipts because auditors require them.",
].join("\n");

const specProseStatus = [
  "# My Feature",
  "",
  "Intro paragraph describing the feature.",
  "",
  "**Status:** Implemented — 2026-06-17",
  "",
  "## Functional Requirements",
  "",
  "The system returns a receipt for every payment.",
].join("\n");

const adrStatusTable = [
  "# ADR-36 Module import boundaries",
  "",
  "Context for this decision.",
  "",
  "| Field | Value |",
  "|---|---|",
  "| Status | Accepted |",
  "",
  "## Behavior",
  "",
  "The gateway retries failed requests three times.",
].join("\n");

const withHrefs = (status, firstHref, secondHref) =>
  spec(status)
    .replace(
      "for every payment.",
      `for every payment. ([validated by](${firstHref}))`,
    )
    .replace("to the payer.", `to the payer. ([validated by](${secondHref}))`);

const bothHref = (status, href) => withHrefs(status, href, href);

const adrWithHref = (status, href) =>
  adr(status).replace("three times.", `three times. ([validated by](${href}))`);

// The rewriter keeps the status cell as wide as it was, so the table stays aligned.
const relabel = (code, from, to) =>
  code.replace(
    `| Status | ${from} |`,
    `| Status | ${to.padEnd(from.length)} |`,
  );

const PAYMENTS_SPEC = path.join(FIXTURES, "specs/payments/spec.md");

ruleTester.run("require-status-matches-coverage", rule, {
  valid: [
    // status matches coverage: none -> Draft, partial -> In Progress, full -> Shipped
    { code: spec("Draft"), filename: "specs/my-feature/spec.md" },
    {
      code: linkFirst(spec("In Progress")),
      filename: "specs/my-feature/spec.md",
    },
    { code: linkBoth(spec("Shipped")), filename: "specs/my-feature/spec.md" },
    { code: adr("draft"), filename: "adrs/ADR-1.md" },
    { code: linkAdr(adr("accepted")), filename: "adrs/ADR-1.md" },
    // `Implemented` is a Shipped synonym, so full coverage supports it
    {
      code: linkBoth(spec("Implemented")),
      filename: "specs/my-feature/spec.md",
    },
    // terminal statuses skip the rule
    { code: spec("Rejected"), filename: "specs/my-feature/spec.md" },
    { code: spec("Retired"), filename: "specs/my-feature/spec.md" },
    { code: adr("superseded"), filename: "adrs/ADR-1.md" },
    // no testable statement -> no tier to compare against
    { code: specNarrativeOnly, filename: "specs/my-feature/spec.md" },
    // outside specs/ and adrs/ the rule does not apply
    { code: spec("Shipped"), filename: "docs/readme.md" },
    { code: specProseStatus, filename: "docs/readme.md" },
    // a `roots` option replaces the defaults, so specs/ falls out of scope
    {
      code: spec("Shipped"),
      filename: "specs/my-feature/spec.md",
      options: [{ roots: { spec: ["docs/features"], adr: ["adrs"] } }],
    },
    // a link into a real test, a whole-file link, an it.each template and a
    // non-JS test all count as evidence for Shipped
    {
      code: bothHref("Shipped", "tests/grounded.test.ts#L3"),
      filename: PAYMENTS_SPEC,
    },
    {
      code: bothHref("Shipped", "tests/no-tests.test.ts"),
      filename: PAYMENTS_SPEC,
    },
    {
      code: bothHref("Shipped", "tests/tagged.test.ts#L1"),
      filename: PAYMENTS_SPEC,
    },
    {
      code: bothHref("Shipped", "fixtures/data_test.go#L40"),
      filename: PAYMENTS_SPEC,
    },
    // a ../ href is read beside the spec, as GitHub renders it
    {
      code: bothHref("Shipped", "../../tests/grounded.test.ts#L3"),
      filename: PAYMENTS_SPEC,
    },
    // hollow links earn no coverage, so Draft is the honest status
    {
      code: bothHref("Draft", "tests/gone.test.ts#L1"),
      filename: PAYMENTS_SPEC,
    },
    {
      code: withHrefs(
        "In Progress",
        "tests/grounded.test.ts#L3",
        "tests/gone.test.ts#L1",
      ),
      filename: PAYMENTS_SPEC,
    },
  ].map(grounded),
  invalid: [
    {
      code: spec("Shipped"),
      filename: "docs/features/my-feature/spec.md",
      options: [{ roots: { spec: ["docs/features"], adr: ["adrs"] } }],
      errors: [{ messageId: "statusMismatch", line: 7 }],
      output: relabel(spec("Shipped"), "Shipped", "Draft"),
    },
    {
      code: spec("Shipped"),
      filename: "specs/my-feature/spec.md",
      errors: [
        {
          messageId: "statusMismatch",
          line: 7,
          data: {
            corpus: "spec",
            actual: "shipped",
            expected: "Draft",
            linked: 0,
            testable: 2,
          },
        },
      ],
      output: relabel(spec("Shipped"), "Shipped", "Draft"),
    },
    {
      code: linkFirst(spec("Draft")),
      filename: "specs/my-feature/spec.md",
      errors: [
        {
          messageId: "statusMismatch",
          line: 7,
          data: {
            corpus: "spec",
            actual: "draft",
            expected: "In Progress",
            linked: 1,
            testable: 2,
          },
        },
      ],
      output: relabel(linkFirst(spec("Draft")), "Draft", "In Progress"),
    },
    {
      // every statement linked to a real test: Draft must be promoted
      code: linkBoth(spec("Draft")),
      filename: "specs/my-feature/spec.md",
      errors: [
        {
          messageId: "statusMismatch",
          line: 7,
          data: {
            corpus: "spec",
            actual: "draft",
            expected: "Shipped",
            linked: 2,
            testable: 2,
          },
        },
      ],
      output: relabel(linkBoth(spec("Draft")), "Draft", "Shipped"),
    },
    {
      code: linkBoth(spec("In Progress")),
      filename: "specs/my-feature/spec.md",
      errors: [{ messageId: "statusMismatch", line: 7 }],
      output: relabel(linkBoth(spec("In Progress")), "In Progress", "Shipped"),
    },
    {
      code: adr("shipped"),
      filename: "adrs/ADR-1.md",
      errors: [
        {
          messageId: "statusMismatch",
          line: 2,
          data: {
            corpus: "ADR",
            actual: "shipped",
            expected: "draft",
            linked: 0,
            testable: 1,
          },
        },
      ],
      output: adr("draft"),
    },
    {
      code: specProseStatus,
      filename: "specs/local-read-cache/spec.md",
      errors: [{ messageId: "untagged", line: 1 }],
    },
    {
      code: spec("Bananas"),
      filename: "specs/my-feature/spec.md",
      errors: [{ messageId: "untagged", line: 7 }],
    },
    {
      code: adrStatusTable,
      filename: "adrs/ADR-36.md",
      errors: [{ messageId: "untagged", line: 1 }],
    },
    // links that hold nothing: the file is gone, the anchor is past every test,
    // the file declares no test, or the href climbs out of the repo
    {
      code: bothHref("Shipped", "tests/gone.test.ts#L1"),
      filename: PAYMENTS_SPEC,
      errors: [
        {
          messageId: "ungroundedLinks",
          line: 7,
          data: {
            corpus: "spec",
            actual: "shipped",
            expected: "Draft",
            linked: 0,
            testable: 2,
            ungrounded: 2,
          },
        },
      ],
      output: relabel(
        bothHref("Shipped", "tests/gone.test.ts#L1"),
        "Shipped",
        "Draft",
      ),
    },
    {
      code: withHrefs(
        "Shipped",
        "tests/grounded.test.ts#L3",
        "tests/grounded.test.ts#L99",
      ),
      filename: PAYMENTS_SPEC,
      errors: [
        {
          messageId: "ungroundedLinks",
          line: 7,
          data: {
            corpus: "spec",
            actual: "shipped",
            expected: "In Progress",
            linked: 1,
            testable: 2,
            ungrounded: 1,
          },
        },
      ],
      output: relabel(
        withHrefs(
          "Shipped",
          "tests/grounded.test.ts#L3",
          "tests/grounded.test.ts#L99",
        ),
        "Shipped",
        "In Progress",
      ),
    },
    {
      code: bothHref("Shipped", "tests/no-tests.test.ts#L1"),
      filename: PAYMENTS_SPEC,
      errors: [{ messageId: "ungroundedLinks", line: 7 }],
      output: relabel(
        bothHref("Shipped", "tests/no-tests.test.ts#L1"),
        "Shipped",
        "Draft",
      ),
    },
    {
      // src/index.test.mjs exists, but outside the fixture root
      code: bothHref("Shipped", "../../../../src/index.test.mjs#L1"),
      filename: PAYMENTS_SPEC,
      errors: [{ messageId: "ungroundedLinks", line: 7 }],
      output: relabel(
        bothHref("Shipped", "../../../../src/index.test.mjs#L1"),
        "Shipped",
        "Draft",
      ),
    },
    {
      code: adrWithHref("shipped", "tests/gone.test.ts#L1"),
      filename: path.join(FIXTURES, "adrs/ADR-1.md"),
      errors: [
        {
          messageId: "ungroundedLinks",
          line: 2,
          data: {
            corpus: "ADR",
            actual: "shipped",
            expected: "draft",
            linked: 0,
            testable: 1,
            ungrounded: 1,
          },
        },
      ],
      output: adrWithHref("draft", "tests/gone.test.ts#L1"),
    },
  ].map(grounded),
});
