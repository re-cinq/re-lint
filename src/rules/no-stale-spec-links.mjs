/**
 * no-stale-spec-links — a `[label](path#Lnn)` link in a spec or ADR must still
 * point at the line its test moved to.
 *
 * Line anchors drift when a branch inserts code above the test they cite. This
 * is `re-lint-reanchor` as a lint rule, so `eslint --fix` repoints the links
 * and a plain `eslint` fails the branch that left them stale. A link whose label
 * names its test follows that `it()`; any other link is mapped through the
 * cited file's `git diff` hunks from the merge base (see `#spec/spec-reanchor.js`).
 *
 * By default only links into files the branch changed are checked, so a pull
 * request never carries unrelated churn; `all` sweeps every link. The verdict
 * depends on git, not only on the file: with no work tree or no merge base the
 * rule has nothing to compare against and reports nothing. The merge base and
 * each cited file's hunks are read once per process, like the corpus in
 * `require-spec-link`: a long-lived ESLint server will not see a commit made
 * after the first lint until it restarts.
 *
 * Reports only links it can repoint. A title no test carries, or an anchor on a
 * blank line, is left to `re-lint-reanchor --check`.
 */

import { dirname, relative } from "node:path";
import { createReanchorer } from "#spec/spec-reanchor.js";
import {
  baseCopyOf,
  mergeBaseOf,
  workTreeRoot,
  workingTreeRepository,
} from "./lib/git-worktree.mjs";
import { lineRange } from "./lib/line-range.mjs";
import { toPosix } from "./lib/spec-link-index.mjs";

const DEFAULT_BASE_REF = "origin/main";
const ANCHOR = /\(([^)#\s]+)#L(\d+)\)/g;

const repositories = new Map();

function repositoryFor(root, baseRef) {
  const key = `${root}\0${baseRef}`;

  if (!repositories.has(key)) {
    const mergeBase = mergeBaseOf(root, baseRef);

    repositories.set(
      key,
      mergeBase && {
        mergeBase,
        repository: workingTreeRepository(root, mergeBase),
      },
    );
  }

  return repositories.get(key);
}

/** `path#L2 -> #L5` for every anchor that differs between a line and its rewrite. */
export function movedAnchors(before, after) {
  const rewritten = [...after.matchAll(ANCHOR)];

  return [...before.matchAll(ANCHOR)]
    .flatMap((anchor, index) =>
      anchor[2] === rewritten[index][2]
        ? []
        : [`${anchor[1]}#L${anchor[2]} -> #L${rewritten[index][2]}`],
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

function reportStale(context, { root, base, all }) {
  const source = context.sourceCode.getText();
  const docPath = toPosix(relative(root, context.filename));
  const { text } = createReanchorer(base.repository, { check: false, all })({
    docPath,
    source,
    baseSource: baseCopyOf(root, base.mergeBase, docPath),
  });

  for (const stale of staleLines(source, text)) {
    context.report({
      loc: { line: stale.line, column: 1 },
      messageId: "staleLink",
      data: { moved: movedAnchors(stale.before, stale.after) },
      fix: (fixer) =>
        fixer.replaceTextRange(lineRange(source, stale.line), stale.after),
    });
  }
}

export default {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "require the #Lnn anchor of a spec or ADR link to follow its test when a branch moves it. Fixes the anchor from git's diff against the merge base; with no git work tree or merge base it reports nothing.",
    },
    schema: [
      {
        type: "object",
        properties: {
          all: { type: "boolean" },
          baseRef: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      staleLink:
        "Spec link anchors are out of date: {{moved}}. Run `eslint --fix` (or `npx re-lint-reanchor`) to repoint them.",
    },
  },

  create(context) {
    const { all = false, baseRef = DEFAULT_BASE_REF } =
      context.options[0] ?? {};
    const root = workTreeRoot(dirname(context.filename));
    const base = root && repositoryFor(root, baseRef);

    if (!base) {
      return {};
    }

    return {
      "root:exit"() {
        reportStale(context, { root, base, all });
      },
    };
  },
};
