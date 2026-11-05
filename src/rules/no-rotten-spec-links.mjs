/**
 * no-rotten-spec-links — a spec or ADR link the branch broke beyond repair:
 * its content hash is on no line of the cited file, its old line was rewritten
 * beyond recognition, its title names no test, or its anchor lands on a blank
 * or closing line. Nothing can fix these, so they are reported without a fix.
 *
 * It reads the same re-anchor as `no-stale-spec-links` over the links into the
 * files the branch changed, whatever that rule's `scope`: a pull request that
 * leaves the repointing of a healable link to a later pass still answers for a
 * link it broke. Configure that rule as a warning with `reportUnhealable: false`
 * and this one as an error to fail only on links a person must repoint.
 */

import { reanchorDocument, DEFAULT_BASE_REF } from "./lib/reanchor-run.mjs";

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "report a spec or ADR link whose content hash and #Lnn anchor both lead nowhere in the cited file, so no fix can repoint it; with no git work tree or merge base it reports nothing.",
    },
    schema: [
      {
        type: "object",
        properties: { baseRef: { type: "string" } },
        additionalProperties: false,
      },
    ],
    messages: {
      rottenLink:
        "Spec link cannot be repointed: {{detail}}. Repoint it by hand to the line of the test or code it cites.",
    },
  },

  create(context) {
    const { baseRef = DEFAULT_BASE_REF } = context.options[0] ?? {};

    return {
      "root:exit"() {
        const run = reanchorDocument(context, baseRef, {
          all: false,
          hashUnchanged: false,
        });

        for (const { docLine, detail } of run?.findings ?? []) {
          context.report({
            loc: { line: docLine, column: 1 },
            messageId: "rottenLink",
            data: { detail },
          });
        }
      },
    };
  },
};
