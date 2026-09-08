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
 * Deliberately carries no `fix`/`suggest`: the `format` CI job runs
 * `eslint --fix` and commits the result back, so a fixer here would silently
 * rewrite spec statuses across the repo on every PR. The message names the label
 * to write; a human writes it.
 */

import { statusLabel } from "./lib/spec-parsers.mjs";
import { DOC_ROOTS_SCHEMA, docKind } from "./lib/doc-kind.mjs";
import { statusMismatch } from "./lib/status-coverage.mjs";

const CORPUS = { spec: "spec", adr: "ADR" };

const REQUIREMENT = {
  spec: "Add a `| Status | Draft |` row to the header table (one of Draft / In Progress / Shipped / Rejected / Retired).",
  adr: "Add `status: draft` to the YAML frontmatter (one of draft / in progress / shipped / rejected / retired).",
};

function mismatchReport(mismatch, kind) {
  const loc = { line: mismatch.line, column: 1 };

  if (mismatch.reason === "untagged") {
    return {
      loc,
      messageId: "untagged",
      data: { corpus: CORPUS[kind], requirement: REQUIREMENT[kind] },
    };
  }

  return {
    loc,
    messageId: "statusMismatch",
    data: {
      corpus: CORPUS[kind],
      actual: mismatch.actual,
      expected: statusLabel(mismatch.expected, kind),
      linked: mismatch.linked,
      testable: mismatch.testable,
    },
  };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require every spec.md / ADR to declare a parseable lifecycle status that matches its test-link coverage: no links -> Draft, some -> In Progress, all -> Shipped. Skips rejected/retired docs and docs with no testable statements.",
    },
    schema: [
      {
        type: "object",
        properties: { roots: DOC_ROOTS_SCHEMA },
        additionalProperties: false,
      },
    ],
    messages: {
      untagged:
        "This {{corpus}} declares no status the parsers can read, so its coverage cannot be checked and no status can be rendered for it. {{requirement}}",
      statusMismatch:
        'Status "{{actual}}" does not match this {{corpus}}\'s test-link coverage — {{linked}} of {{testable}} testable statements carry a ([validated by](test.ts#Lline)) link. Either set the status to "{{expected}}", or link the remaining statements to the tests that validate them.',
    },
  },

  create(context) {
    const kind = docKind(context.filename, context.options[0]?.roots);

    if (!kind) {
      return {};
    }
    const text = context.sourceCode.getText();

    return {
      "root:exit"() {
        const mismatch = statusMismatch(text, kind);

        if (mismatch) {
          context.report(mismatchReport(mismatch, kind));
        }
      },
    };
  },
};
