/**
 * reanchor-run — one re-anchor of a spec document per lint run, shared by
 * `no-stale-spec-links` (the fixable warnings) and `no-rotten-spec-links` (the
 * links nothing can repoint), so ESLint does not re-anchor a document twice.
 */

import { dirname, relative } from "node:path";
import { createReanchorer } from "#spec/spec-reanchor.js";
import {
  baseCopyOf,
  mergeBaseOf,
  workTreeRoot,
  workingTreeRepository,
} from "./git-worktree.mjs";
import { toPosix } from "./spec-link-index.mjs";

export const DEFAULT_BASE_REF = "origin/main";

const repositories = new Map();
const runs = new Map();

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

/**
 * The re-anchored text and findings for the document ESLint is linting, or
 * null when it lies outside a git work tree or has no merge base with
 * `baseRef`. `options` are the re-anchorer's own (`all`, `hashUnchanged`,
 * `authoredOnly`).
 */
export function reanchorDocument(context, baseRef, options) {
  const root = workTreeRoot(dirname(context.filename));
  const base = root && repositoryFor(root, baseRef);

  if (!base) {
    return null;
  }
  const source = context.sourceCode.getText();
  const key = JSON.stringify([context.filename, baseRef, options, source]);

  if (!runs.has(key)) {
    const docPath = toPosix(relative(root, context.filename));

    runs.set(
      key,
      createReanchorer(base.repository, { check: false, ...options })({
        docPath,
        source,
        baseSource: baseCopyOf(root, base.mergeBase, docPath),
      }),
    );
  }

  return { source, ...runs.get(key) };
}
