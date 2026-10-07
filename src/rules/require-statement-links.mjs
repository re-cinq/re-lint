/**
 * require-statement-links — every testable statement in a spec.md / ADR must
 * carry an inline `([validated by](test.ts#Lnn))` link.
 *
 * The statement-side complement of `require-spec-link` (which enforces the same
 * link from the test's side). It walks each `.md` body, keeps the statements the
 * shared section heuristic calls *testable* (intro / vision / background /
 * rationale / open-question / limitation prose is exempt), and reports any with
 * no test link — see `lib/spec-parsers.mjs`. A link counts only when it is
 * evidence (its file resolves and its `#Lnn` lands in an `it()`/`test()`
 * declaration — `lib/test-evidence.mjs`), the same test
 * `require-status-matches-coverage` applies, so the two rules can never
 * disagree about what is linked. A statement whose links are all hollow is
 * reported as such, rather than as having no link.
 *
 * Reporting is gated on the doc's normalized lifecycle status (specs and ADRs
 * fold into the same buckets): a `rejected` (never accepted) or `retired` (shipped then
 * superseded/removed) doc skips the rule entirely; every other status warns.
 *
 * Which folders hold the corpus comes from the `roots` option
 * (`{ spec: ["specs"], adr: ["adrs"] }` by default — see `lib/doc-kind.mjs`).
 */

import {
  parseDocStatus,
  statementCoverage,
  statusTier,
} from "./lib/spec-parsers.mjs";
import { DOC_ROOTS_SCHEMA, docKind } from "./lib/doc-kind.mjs";
import { groundingFor } from "./lib/test-evidence.mjs";

const EXCERPT_MAX = 60;

function excerpt(text) {
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX)}…` : text;
}

function reportUnlinked(context, text, status) {
  const { unlinked, ungrounded } = statementCoverage(
    text,
    groundingFor(context),
  );
  const hollow = new Set(ungrounded);

  for (const statement of unlinked) {
    context.report({
      loc: { line: statement.line, column: 1 },
      messageId: hollow.has(statement)
        ? "ungroundedStatement"
        : "unlinkedStatement",
      data: { status, excerpt: excerpt(statement.text) },
    });
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require every testable spec.md / ADR statement to carry an inline ([validated by](test.ts#Lline)) link. Skips rejected specs / superseded ADRs; warns on everything else.",
    },
    schema: [
      {
        type: "object",
        properties: { roots: DOC_ROOTS_SCHEMA, specsRoot: { type: "string" } },
        additionalProperties: false,
      },
    ],
    messages: {
      unlinkedStatement:
        'Testable statement in a {{status}} spec/ADR has no test link — add ([validated by](path/to/test.ts#Lline)) to the test that validates it, or move it under a narrative heading (Background / Rationale / Open Questions …) if it states no testable behaviour. Statement: "{{excerpt}}"',
      ungroundedStatement:
        'Testable statement in a {{status}} spec/ADR carries a ([validated by](test.ts#Lline)) link that is not evidence — its target file or #Lnn line holds no it()/test() declaration. Re-anchor it to the test that validates the statement (`npx re-lint-reanchor`), or remove the link. Statement: "{{excerpt}}"',
    },
  },

  create(context) {
    const kind = docKind(context.filename, context.options[0]?.roots);

    if (!kind) {
      return {};
    }
    const text = context.sourceCode.getText();
    const { status } = parseDocStatus(text, kind);

    if (statusTier(status) === "skip") {
      return {};
    }

    return {
      "root:exit"() {
        reportUnlinked(context, text, status ?? "untagged");
      },
    };
  },
};
