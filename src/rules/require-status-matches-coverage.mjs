/**
 * require-status-matches-coverage — a spec.md / ADR must declare the lifecycle
 * status its test links can support, and must declare one the parsers can read.
 *
 * Status is the org's backlog signal: the web-UI pills render it, spec-status-upkeep
 * flips it, humans trust it. This rule makes it answerable to the corpus's own
 * `([validated by](test.ts#Lnn))` links rather than to whoever last edited the row:
 *
 *   no testable statement linked    -> Draft
 *   some testable statements linked -> In Progress
 *   every testable statement linked -> Shipped
 *
 * The per-doc complement of `require-statement-links` (which nags per unlinked
 * statement); both read the same `statementCoverage` walk, so the two rules can
 * never disagree about what is linked. Skips `rejected` / `retired` docs via the
 * shared `statusTier`, and docs with no testable statements (no tier to infer).
 *
 * Which folders hold the corpus comes from the `roots` option
 * (`{ spec: ["specs"], adr: ["adrs"] }` by default) — see `lib/status-coverage.mjs`
 * for the coverage walk.
 *
 * A link only counts when it is evidence: its target file resolves in the
 * repository and its `#Lnn` lands inside an `it()`/`test()` declaration (see
 * `lib/test-evidence.mjs`). A `Shipped` row cannot be bought with a link to a
 * file that is gone or a line that is past every test.
 *
 * Carries a `fix` that rewrites the status row to the one the evidence
 * supports (`withStatusLabel`), in both directions, touching only that line. It never edits a link: the
 * stale ones are for `re-lint-reanchor`, or a human, to repoint. A CI job that
 * runs `eslint --fix` and commits the result will therefore rewrite statuses
 * for the author; run that pass with this rule off to keep the PR red instead.
 */

import { statusLabel } from "./lib/spec-parsers.mjs";
import { DOC_ROOTS_SCHEMA, docKind } from "./lib/doc-kind.mjs";
import { statusMismatch, withStatusLabel } from "./lib/status-coverage.mjs";
import { lineRange } from "./lib/line-range.mjs";
import { groundingFor } from "./lib/test-evidence.mjs";

const CORPUS = { spec: "spec", adr: "ADR" };

const REQUIREMENT = {
  spec: "Add a `| Status | Draft |` row to the header table (one of Draft / In Progress / Shipped / Rejected / Retired).",
  adr: "Add `status: draft` to the YAML frontmatter (one of draft / in progress / shipped / rejected / retired).",
};

function statusFix(text, kind, mismatch, expected) {
  return (fixer) => {
    const rewritten = withStatusLabel(text, kind, expected);

    return rewritten === null
      ? null
      : fixer.replaceTextRange(
          lineRange(text, mismatch.line),
          rewritten.split("\n")[mismatch.line - 1].replace(/\r$/, ""),
        );
  };
}

function mismatchReport(mismatch, kind, text) {
  const loc = { line: mismatch.line, column: 1 };

  if (mismatch.reason === "untagged") {
    return {
      loc,
      messageId: "untagged",
      data: { corpus: CORPUS[kind], requirement: REQUIREMENT[kind] },
    };
  }
  const expected = statusLabel(mismatch.expected, kind);
  const tally = {
    corpus: CORPUS[kind],
    actual: mismatch.actual,
    expected,
    linked: mismatch.linked,
    testable: mismatch.testable,
  };
  const fix = statusFix(text, kind, mismatch, expected);

  return mismatch.ungrounded > 0
    ? {
        loc,
        messageId: "ungroundedLinks",
        data: { ...tally, ungrounded: mismatch.ungrounded },
        fix,
      }
    : { loc, messageId: "statusMismatch", data: tally, fix };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require every spec.md / ADR to declare a parseable lifecycle status that matches its test-link coverage: no links -> Draft, some -> In Progress, all -> Shipped. A link counts only when its file exists and its #Lnn lands in an it()/test() declaration. Fixes the status row. Skips rejected/retired docs and docs with no testable statements.",
    },
    schema: [
      {
        type: "object",
        properties: { roots: DOC_ROOTS_SCHEMA, specsRoot: { type: "string" } },
        additionalProperties: false,
      },
    ],
    fixable: "code",
    messages: {
      untagged:
        "This {{corpus}} declares no status the parsers can read, so its coverage cannot be checked and no status can be rendered for it. {{requirement}}",
      statusMismatch:
        'Status "{{actual}}" does not match this {{corpus}}\'s test-link coverage — {{linked}} of {{testable}} testable statements carry a ([validated by](test.ts#Lline)) link. Either set the status to "{{expected}}", or link the remaining statements to the tests that validate them.',
      ungroundedLinks:
        'Status "{{actual}}" does not match this {{corpus}}\'s coverage — {{linked}} of {{testable}} testable statements carry a ([validated by](test.ts#Lline)) link that lands in a real it()/test() declaration, and {{ungrounded}} carry a link whose target file or line holds no test. Either set the status to "{{expected}}", or re-anchor the stale links (`npx re-lint-reanchor`) to the tests that validate those statements.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const kind = docKind(context.filename, options.roots);

    if (!kind) {
      return {};
    }
    const text = context.sourceCode.getText();
    return {
      "root:exit"() {
        const mismatch = statusMismatch(text, kind, groundingFor(context));

        if (mismatch) {
          context.report(mismatchReport(mismatch, kind, text));
        }
      },
    };
  },
};
