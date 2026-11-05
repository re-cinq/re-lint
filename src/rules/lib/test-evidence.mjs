/**
 * test-evidence — whether a `([validated by](test.ts#Lnn))` link points at real
 * test evidence in this checkout, so a status can be judged on links that hold
 * rather than on links that merely exist.
 *
 * A link is grounded when its target file resolves inside the repository and
 * its `#Lnn` lands inside an `it()`/`test()` declaration (`declarationSpans`,
 * the same scan `re-lint-reanchor` relocates links with, so the two cannot
 * disagree about where a test begins). A link carrying a content hash is read
 * at the line that carries it, nearest its `#Lnn`: a branch that moved the test
 * leaves the link evidence while its anchor waits to be repointed. A whole-file link needs only the file,
 * and so does a test in a language with no `it()` to scan (`_test.go`,
 * `test_*.py`). A link to another repository's test, written as a URL, cannot be
 * checked from this checkout and is trusted, as every link was before. Nothing here runs a test: CI already fails a red PR.
 *
 * Filesystem work lives here, not in the vendored parsers, which stay runnable
 * where there is no checkout.
 *
 * The declaration spans are read once per file per process, like the corpus in
 * `require-spec-link`: a long-lived ESLint server (VS Code extension, --watch)
 * will not see a test added after the first lint until the server restarts.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import {
  declarationSpans,
  resolveLinkPath,
  spansCover,
} from "./spec-parsers.mjs";
import { toPosix } from "./spec-link-index.mjs";
import { linesWithHash, nearestLine } from "#spec/anchor-hash.js";
import { workTreeRoot } from "./git-worktree.mjs";

const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const sourcesByFile = new Map();

function sourceOf(file) {
  if (!sourcesByFile.has(file)) {
    const text = readFileSync(file, "utf8");

    sourcesByFile.set(file, { text, spans: declarationSpans(text) });
  }

  return sourcesByFile.get(file);
}

// The line a link means: the one carrying its hash nearest its #Lnn, else its #Lnn.
function meantLine(link, text) {
  return link.hash
    ? (nearestLine(linesWithHash(text, link.hash), link.line) ?? link.line)
    : link.line;
}

/** A target that only resolves outside `root` is dead inside the repo. */
function fileInRepo(root, repoPath) {
  const file = resolve(root, repoPath);
  const inRepo = file.startsWith(root + sep);

  return inRepo && existsSync(file) && statSync(file).isFile() ? file : null;
}

/**
 * @param {{ path: string, line: number | null, hash?: string | null }} link
 * @param {{ root: string, specPath: string }} where root = repo root, specPath = repo-relative path of the linking document
 */
export function isGroundedLink(link, { root, specPath }) {
  if (URL_SCHEME.test(link.path)) {
    return true;
  }
  const file = fileInRepo(resolve(root), resolveLinkPath(link.path, specPath));

  if (file === null) {
    return false;
  }

  if (link.line === null || !SCANNABLE_EXTENSIONS.has(extname(file))) {
    return true;
  }

  const { text, spans } = sourceOf(file);

  return spansCover(spans, meantLine(link, text));
}

/** The predicate `statementCoverage` takes as `isGroundedLink`. */
export function groundedLinkPredicate(where) {
  return (link) => isGroundedLink(link, where);
}

/**
 * The `{ isGroundedLink }` coverage option for the document a rule is linting:
 * links resolve from `options.specsRoot`, else from the git work tree the
 * document sits in, else from the working directory. ESLint run from a
 * subdirectory lints the same document with another `cwd`, and a root read
 * from it made every repo-relative link a miss, which read as a corpus with no
 * evidence at all.
 */
export function groundingFor(context) {
  const root =
    context.options[0]?.specsRoot ??
    workTreeRoot(dirname(context.filename)) ??
    workTreeRoot(context.cwd) ??
    context.cwd;

  return {
    isGroundedLink: groundedLinkPredicate({
      root,
      specPath: toPosix(relative(root, context.filename)),
    }),
  };
}

export function resetEvidenceCache() {
  sourcesByFile.clear();
}
