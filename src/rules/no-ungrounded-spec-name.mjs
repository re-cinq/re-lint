/**
 * no-ungrounded-spec-name — a repository path a spec or ADR names must exist.
 *
 * `no-dead-md-links` checks markdown LINKS, and deliberately cannot see these:
 * the house convention writes every code path as inline code precisely so it is
 * not link-checked, so `apps/floor/src/work/task/dispatch-agent-cr.ts` in
 * backticks is an inlineCode node that never reaches a link node. The result was
 * structural: a spec could name a file deleted months ago and nothing noticed.
 *
 * The planning line already runs this check, but only on the specs ITS agents
 * write, inside a three-round budget that expires into a pass. A spec a person
 * writes or edits by hand was never checked at all. This closes that: the same
 * vendored parser, on every spec and ADR the linter sees.
 *
 * Only path findings are reported. `groundingFindings` also checks identifiers
 * against the file a line names, which needs the file contents and is noisy
 * outside the planning line's narrower input, so those are dropped here.
 *
 * The escape hatches are the parser's own: a line that says the feature ADDS a
 * path, or a files-touched / project-structure list that names it, grounds that
 * path without it being on disk yet.
 */

import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { DOC_ROOTS_SCHEMA, docKind } from "./lib/doc-kind.mjs";
import {
  groundingFindings,
  namedPaths,
  parseDocStatus,
  statusTier,
} from "./lib/spec-parsers.mjs";

/** A path that only resolves by climbing out of the repo is not in the repo. */
function existsInRepo(cwd, candidate) {
  const full = resolve(cwd, candidate);

  return (full === cwd || full.startsWith(cwd + sep)) && existsSync(full);
}

/**
 * The parser asks whether a name is "on the tree". Only the names this document
 * writes can be reported, so the tree it needs is exactly those of them that are
 * on disk — no repository walk, and the same answers a full tree would give.
 */
function treeOf(text, cwd) {
  return namedPaths(text).filter((name) => existsInRepo(cwd, name));
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "repository paths a spec or ADR names must exist",
    },
    schema: [DOC_ROOTS_SCHEMA],
    messages: {
      missing:
        "`{{name}}` is not in this repository. A spec that names a path the code does not have sends its reader, and the agent decomposing it, to a file that moved or went — write the path the code has now, or say that this change adds it.",
      retired:
        "`{{name}}` has been retired. {{hint}} A spec that still names it describes how the system used to work.",
    },
  },

  create(context) {
    const kind = docKind(context.filename, context.options[0]?.roots);

    if (!kind) {
      return {};
    }
    const text = context.sourceCode.getText();

    if (statusTier(parseDocStatus(text, kind).status) === "skip") {
      return {};
    }

    return {
      "root:exit"() {
        const cwd = context.cwd ?? process.cwd();
        const found = groundingFindings({
          text,
          tree: treeOf(text, cwd),
          files: {},
        });

        for (const finding of found.filter(
          (each) => each.kind !== "identifier",
        )) {
          context.report({
            loc: { line: finding.line, column: 1 },
            messageId: finding.kind === "retired" ? "retired" : "missing",
            data: { name: finding.name, hint: finding.hint ?? "" },
          });
        }
      },
    };
  },
};
