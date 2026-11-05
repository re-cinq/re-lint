/**
 * git-worktree — the git and filesystem side of re-anchoring spec links,
 * shared by `re-lint-reanchor` and `no-stale-spec-links` so the two read the
 * branch the same way: files changed since the merge base, each cited file's
 * `git diff -U0` hunks, and a document's merge-base copy.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseHunks } from "#spec/spec-reanchor.js";

const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;

/** git's stdout, or null when the command fails (no repository, unknown ref). */
export function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: GIT_OUTPUT_LIMIT,
  });

  return result.status === 0 ? result.stdout : null;
}

/** `git ls-files` lists only what sits below the directory git runs in, so work from the work tree's root. */
export function workTreeRoot(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"])?.trim() || null;
}

/** Mid-merge the working tree already holds MERGE_HEAD's side, so the baseline includes it. */
export function mergeBaseOf(root, baseRef) {
  const mergeHead = git(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "MERGE_HEAD",
  ])?.trim();
  const heads = mergeHead ? ["HEAD", mergeHead] : ["HEAD"];

  return git(root, ["merge-base", baseRef, ...heads])?.trim() || null;
}

export const splitLines = (text) => (text ?? "").split("\n").filter(Boolean);

const cached = (cache, key, load) => {
  if (!cache.has(key)) {
    cache.set(key, load(key));
  }

  return cache.get(key);
};

// A working-tree file's text, or null for a directory, a missing path or one outside the tree.
const readWorking = (root, path) => {
  const full = join(root, path);
  const isFile =
    !path.startsWith("..") && existsSync(full) && statSync(full).isFile();

  return isFile ? readFileSync(full, "utf8") : null;
};

// Paths the branch changed or added since `mergeBase`, untracked ones included.
const changedPaths = (root, mergeBase) =>
  new Set([
    ...splitLines(git(root, ["diff", "--name-only", mergeBase])),
    ...splitLines(git(root, ["ls-files", "--others", "--exclude-standard"])),
  ]);

/** The `ReanchorRepository` the re-anchorer reads: the working tree, diffed against `mergeBase`. */
export function workingTreeRepository(root, mergeBase) {
  const changed = changedPaths(root, mergeBase);
  const caches = { files: new Map(), hunks: new Map(), base: new Map() };
  let renames = null;

  return {
    workingFile: (path) =>
      cached(caches.files, path, () => readWorking(root, path)),
    hunks: (path) =>
      cached(caches.hunks, path, () =>
        parseHunks(git(root, ["diff", "-U0", mergeBase, "--", path]) ?? ""),
      ),
    isChanged: (path) => changed.has(path),
    baseFile: (path) =>
      cached(caches.base, path, () =>
        git(root, ["show", `${mergeBase}:${path}`]),
      ),
    renamedTo: (path) => {
      renames ??= renamesIn(
        git(root, ["diff", "-M", "--name-status", mergeBase]) ?? "",
      );

      return renames.get(path) ?? [];
    },
  };
}

/** `git diff --name-status` rename records as a map from each old path to the paths it became. */
export function renamesIn(nameStatus) {
  const renamed = new Map();

  for (const [, from, to] of nameStatus.matchAll(
    /^R\d*\t([^\t\n]+)\t([^\t\n]+)$/gm,
  )) {
    renamed.set(from, [...(renamed.get(from) ?? []), to]);
  }

  return renamed;
}

/** A document as it stood at the merge base, or null when the branch added it. */
export function baseCopyOf(root, mergeBase, docPath) {
  return git(root, ["show", `${mergeBase}:${docPath}`]);
}
