/**
 * require-intro-paragraph — every spec.md / ADR must open with a real lead
 * paragraph, because whatever renders the corpus shows that first paragraph as
 * the document's summary. A doc that jumps from its title straight into a
 * metadata table, a bare `## Status`, or a `## Section` heading gives the
 * summary nothing.
 *
 * The lead paragraph must sit after the title (specs: below the status table;
 * ADRs: below the frontmatter + H1) and BEFORE the first `##` section — the
 * placement check lives in `lib/intro-paragraph.mjs`.
 *
 * Flat `error` for every spec.md / ADR regardless of lifecycle status (unlike
 * the tiered `require-statement-links`): a summary renders the same whether the
 * doc is Draft or Shipped. Which folders hold the corpus comes from the `roots`
 * option (`{ spec: ["specs"], adr: ["adrs"] }` by default).
 */

import { DOC_ROOTS_SCHEMA, docKind } from "./lib/doc-kind.mjs";
import { hasLeadParagraph } from "./lib/intro-paragraph.mjs";

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require every spec.md / ADR to open with a lead paragraph (after the title, before the first ## section) that is rendered as the document summary.",
    },
    schema: [
      {
        type: "object",
        properties: { roots: DOC_ROOTS_SCHEMA },
        additionalProperties: false,
      },
    ],
    messages: {
      missingIntro:
        "Add a 1–2 sentence introductory paragraph (at least 40 characters) after the title (specs: below the status table; ADRs: below the H1) and before the first `##` section — the first paragraph is rendered as the document summary.",
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
        if (!hasLeadParagraph(text, kind)) {
          context.report({
            loc: { line: 1, column: 1 },
            messageId: "missingIntro",
          });
        }
      },
    };
  },
};
