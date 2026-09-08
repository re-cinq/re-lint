/**
 * spec-link-index — reads the org's spec/adr markdown and builds the
 * test-file → linked-lines index the `require-spec-link` rule matches against.
 *
 * The source of truth for a spec↔test link lives INSIDE the spec.md/adr `.md`
 * as an inline trailing parenthetical — `([validated by](path/to/test.ts#L42))`
 * — parsed by the canonical `linksForStatements` (reused here, not re-implemented).
 * Each test link contributes its `#Lline` to that test path's line set; a link
 * with no `#L` anchor marks the whole file linked.
 *
 * Split out of the rule so the pure index (buildLinkIndex) and the filesystem
 * walk (readSpecFiles) are testable without a RuleTester.
 */

import fs from "node:fs";
import path from "node:path";
import { linksForStatements, resolveLinkPath } from "./spec-parsers.mjs";

/** @typedef {{ lines: Set<number>, wholeFile: boolean }} LinkEntry */

export function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

/** True when at least one of `dirs` exists under `root`. The rule uses this to
 * tell "no test is linked" from "the corpus was never found" (e.g. eslint run
 * from a subdirectory where `context.cwd` is not the repo root). */
export function corpusExists(root, dirs = ["specs", "adrs"]) {
  return dirs.some((dir) => fs.existsSync(path.join(root, dir)));
}

function testLinksOf(file) {
  return linksForStatements(file.content).flatMap(({ testLinks }) =>
    testLinks.map((link) => ({ link, specPath: file.path })),
  );
}

function entryFor(index, key) {
  const existing = index.get(key);
  if (existing) {
    return existing;
  }
  const created = { lines: new Set(), wholeFile: false };
  index.set(key, created);
  return created;
}

function recordLink(index, { link, specPath }) {
  const entry = entryFor(index, resolveLinkPath(link.path, specPath));
  if (link.line === null) {
    entry.wholeFile = true;
    return;
  }
  entry.lines.add(link.line);
}

/**
 * Fold every test link found across the given markdown files into a
 * `Map<repoRelTestPath, LinkEntry>`. Href paths are resolved to canonical
 * repo-root-relative form via the shared `resolveLinkPath` — the same resolver
 * the graph binder uses — so a `../`-relative href (relative to the spec's own
 * directory, as GitHub renders it) indexes under the test's repo-relative key
 * and matches, instead of a literal `../../apps/x.test.ts` miss.
 *
 * @param {Array<{ path: string, content: string }>} files
 * @returns {Map<string, LinkEntry>}
 */
export function buildLinkIndex(files) {
  const index = new Map();
  files.flatMap(testLinksOf).forEach((found) => recordLink(index, found));
  return index;
}

function readMarkdownUnder(root, base) {
  return fs
    .readdirSync(base, { recursive: true })
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => {
      const full = path.join(base, entry);
      return {
        path: toPosix(path.relative(root, full)),
        content: fs.readFileSync(full, "utf8"),
      };
    });
}

/**
 * Read every `*.md` under each of `dirs` (relative to `root`), returning
 * `{ path, content }` with a root-relative posix path. Absent dirs are skipped.
 *
 * @param {string} root
 * @param {string[]} [dirs]
 * @returns {Array<{ path: string, content: string }>}
 */
export function readSpecFiles(root, dirs = ["specs", "adrs"]) {
  return dirs
    .map((dir) => path.join(root, dir))
    .filter((base) => fs.existsSync(base))
    .flatMap((base) => readMarkdownUnder(root, base));
}
