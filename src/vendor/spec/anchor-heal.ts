// Where a hashed spec link's line went when its hash is no longer in the file: a test the branch rewrote in place, or one it renamed and moved, found by how much of the old line's text it still carries.
import {
  isHashableLine,
  linesWithHash,
  nearestLine,
  normalizeAnchorLine,
} from "./anchor-hash.js";
import type { Hunk } from "./spec-reanchor.js";

/** A line renamed and moved must keep this share of its old character pairs. */
export const SIMILARITY_FLOOR = 0.6;
// The best match must beat the runner-up by this much, or the guess is a coin toss.
const SIMILARITY_MARGIN = 0.1;
// A same-size rewrite at the same place is trusted on far less: it only has to still read like the old line.
const IN_PLACE_FLOOR = 0.3;

/** A file the link may now point into, with its working-tree text. */
export interface AnchorFile {
  path: string;
  source: string;
}

/** A line a link can move to. */
export interface AnchorSpot {
  path: string;
  line: number;
  text: string;
}

function bigrams(text: string): Set<string> {
  const pairs = new Set<string>();

  for (let index = 0; index < text.length - 1; index += 1) {
    pairs.add(text.slice(index, index + 2));
  }

  return pairs;
}

/** Jaccard similarity of two lines' normalized character pairs: 1 for the same text, 0 for nothing shared. */
export function similarity(first: string, second: string): number {
  const firstPairs = bigrams(normalizeAnchorLine(first));
  const secondPairs = bigrams(normalizeAnchorLine(second));
  const shared = [...firstPairs].filter((pair) => secondPairs.has(pair)).length;
  const union = firstPairs.size + secondPairs.size - shared;

  return union === 0 ? 1 : shared / union;
}

/** The first file that carries `hash`, at the line nearest `near`. */
export function findHash(
  files: readonly AnchorFile[],
  hash: string,
  near: number,
): AnchorSpot | null {
  for (const { path, source } of files) {
    const line = nearestLine(linesWithHash(source, hash), near);

    if (line !== null) {
      return { path, line, text: source.split("\n")[line - 1] };
    }
  }

  return null;
}

/** A merge-base line inside a hunk that rewrote as many lines as it removed, mapped by its offset in that hunk; null anywhere else. */
export function rewrittenLine(
  line: number,
  hunks: readonly Hunk[],
): number | null {
  const hunk = hunks.find(
    (candidate) =>
      line >= candidate.oldStart &&
      line < candidate.oldStart + candidate.oldCount,
  );

  return hunk && hunk.oldCount === hunk.newCount
    ? hunk.newStart + (line - hunk.oldStart)
    : null;
}

/** The line a same-size rewrite put where `oldText` stood, when it still reads like it. */
export function rewrittenInPlace(
  file: AnchorFile,
  hunks: readonly Hunk[],
  old: { line: number; text: string },
): AnchorSpot | null {
  const line = rewrittenLine(old.line, hunks);
  const text = line === null ? undefined : file.source.split("\n")[line - 1];
  const readsAlike =
    text !== undefined &&
    isHashableLine(text) &&
    similarity(text, old.text) >= IN_PLACE_FLOOR;

  return readsAlike && line !== null ? { path: file.path, line, text } : null;
}

/** The one line across the files most like `oldText`, when it is alike enough and clearly ahead of the next best. */
export function mostSimilar(
  files: readonly AnchorFile[],
  oldText: string,
): AnchorSpot | null {
  const ranked = files
    .flatMap(({ path, source }) =>
      source.split("\n").flatMap((text, index) =>
        isHashableLine(text)
          ? [
              {
                path,
                line: index + 1,
                text,
                score: similarity(text, oldText),
              },
            ]
          : [],
      ),
    )
    .sort((first, second) => second.score - first.score);
  const [best, runnerUp] = ranked;
  const clear =
    best !== undefined &&
    best.score >= SIMILARITY_FLOOR &&
    (runnerUp === undefined ||
      best.score - runnerUp.score >= SIMILARITY_MARGIN);

  return clear ? { path: best.path, line: best.line, text: best.text } : null;
}
