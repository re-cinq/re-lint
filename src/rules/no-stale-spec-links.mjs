/**
 * no-stale-spec-links — a `[label@hash](path#Lnn)` link in a spec or ADR must
 * name the line it cites by content, and its anchor must still point at it.
 *
 * Line anchors drift when a branch inserts code above the test they cite, so a
 * link carries the content hash of its line (`#spec/anchor-hash.js`) and follows
 * that hash: `eslint --fix` adds a hash to a link without one, repoints a link to
 * the line carrying its hash, and follows a test the branch renamed, rewritten in
 * place or moved, by how much of the old line's text it keeps. A link with no
 * hash yet heals as before: by the test its label names, else through the cited
 * file's `git diff` hunks from the merge base.
 *
 * `scope` picks the links it touches: `changed` (default) the links into files
 * the branch changed, `authored` only the links on document lines the branch
 * wrote, so a pull request carries no link churn it did not write, `all` every
 * link. `hashAll` also gives a hash to a link into a file the branch left alone.
 * With no work tree or no merge base it reports nothing. The merge base and each
 * cited file's hunks are read once per process: a long-lived ESLint server will
 * not see a commit made after the first lint until it restarts.
 *
 * A link nothing can repoint is reported here too, without a fix, unless
 * `reportUnhealable: false`: a configuration that wants this rule as a warning
 * turns it off and lets `no-rotten-spec-links` report those links as errors.
 */

import { reanchorDocument, DEFAULT_BASE_REF } from "./lib/reanchor-run.mjs";
import { lineRange } from "./lib/line-range.mjs";

const LINK = /\[[^\]]*\]\([^)#\s]+#L\d+\)/g;

/** `before -> after` for every link that differs between a line and its rewrite. */
export function movedAnchors(before, after) {
  const rewritten = [...after.matchAll(LINK)];

  return [...before.matchAll(LINK)]
    .flatMap((link, index) =>
      link[0] === rewritten[index]?.[0]
        ? []
        : [`${link[0]} -> ${rewritten[index]?.[0]}`],
    )
    .join(", ");
}

function staleLines(source, rewritten) {
  const after = rewritten.split("\n");

  return source
    .split("\n")
    .flatMap((before, index) =>
      before === after[index]
        ? []
        : [{ line: index + 1, before, after: after[index] }],
    );
}

const SCOPES = {
  changed: { all: false },
  authored: { all: false, authoredOnly: true },
  all: { all: true },
};

// The re-anchor options a rule configuration asks for: `all: true` is the older spelling of `scope: "all"`.
function withDefaults(options = {}) {
  const scope = options.scope ?? (options.all ? "all" : "changed");

  return {
    baseRef: options.baseRef ?? DEFAULT_BASE_REF,
    reportUnhealable: options.reportUnhealable ?? true,
    reanchor: {
      ...SCOPES[scope],
      addHashes: true,
      hashUnchanged: options.hashAll === true,
    },
  };
}

function report(context, run, reportUnhealable) {
  for (const stale of staleLines(run.source, run.text)) {
    context.report({
      loc: { line: stale.line, column: 1 },
      messageId: "staleLink",
      data: { moved: movedAnchors(stale.before, stale.after) },
      fix: (fixer) =>
        fixer.replaceTextRange(lineRange(run.source, stale.line), stale.after),
    });
  }

  for (const { docLine, detail } of reportUnhealable ? run.findings : []) {
    context.report({
      loc: { line: docLine, column: 1 },
      messageId: "unhealableLink",
      data: { detail },
    });
  }
}

export default {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "require a spec or ADR link to carry the content hash of the line it cites and its #Lnn anchor to follow that line. Fixes both from the cited file and git's diff against the merge base; with no git work tree or merge base it reports nothing.",
    },
    schema: [
      {
        type: "object",
        properties: {
          all: { type: "boolean" },
          scope: { enum: ["changed", "authored", "all"] },
          hashAll: { type: "boolean" },
          baseRef: { type: "string" },
          reportUnhealable: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      staleLink:
        "Spec link anchors are out of date: {{moved}}. Run `eslint --fix` (or `npx re-lint-reanchor`) to repoint them and add their content hash.",
      unhealableLink:
        "Spec link cannot be repointed automatically: {{detail}}. Repoint it by hand to the line of the test it validates.",
    },
  },

  create(context) {
    const { baseRef, reportUnhealable, reanchor } = withDefaults(
      context.options[0],
    );

    return {
      "root:exit"() {
        const run = reanchorDocument(context, baseRef, reanchor);

        if (run !== null) {
          report(context, run, reportUnhealable);
        }
      },
    };
  },
};
