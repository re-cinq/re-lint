// Pure logic behind `re-lint-reanchor`: heals the `[label](path#Lnn)` links in spec markdown after a branch edits a cited file. Git and fs access stay in the CLI, behind `ReanchorRepository`.
import { posix } from "node:path";
import { anchorHashOf, linesWithHash, nearestLine } from "./anchor-hash.js";
import {
  findHash,
  mostSimilar,
  rewrittenInPlace,
  type AnchorFile,
} from "./anchor-heal.js";
import { splitHashedLabel, withAnchorHash } from "./spec-link-parser.js";

/** The documents a corpus scan reads when no pattern is given, in report order. */
export const DEFAULT_CORPUS: readonly string[] = [
  "specs/**/*.md",
  ".specify/spec.md",
  "adrs/**/*.md",
];

/** Files whose `it()`/`test()` declarations a titled link can relocate to. */
export const DEFAULT_TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

// A `[label](path#Lnn)` link whose path is relative, so a URL's scheme rules it out.
const ANCHOR_LINK =
  /\[([^\]]*)\]\(((?![A-Za-z][A-Za-z0-9+.-]*:)[^)#\s]+)#L(\d+)\)/g;
const CALL_PREFIX =
  "^\\s*(?:await\\s+)?(?:it|test)(?:\\.[A-Za-z_$][\\w$]*|\\[[^\\]]*\\])*";
const EACH_TABLE = "(?:\\((?:[^()]|\\([^()]*\\))*\\)|`[^`]*`)";
const DECLARATION = new RegExp(
  `${CALL_PREFIX}\\s*${EACH_TABLE}?\\s*\\(\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`,
);
const TEST_OPENING = new RegExp(`${CALL_PREFIX}\\s*(?:\\(|\`)`);
// `test.describe(` and `await test.step(` open like a test and still bound a span, but a suite or a step is no test of its own: nothing it titles can stand as a statement's evidence.
const GROUPING_OPENING = new RegExp(
  `${CALL_PREFIX}\\.(?:describe|suite|step)\\b`,
);
const SUITE_OPENING =
  /^\s*(?:describe|suite)(?:\.[A-Za-z_$][\w$]*)*\s*(?:\(|`)/;
const LABEL_PREFIX = /^(?:validated|implemented) by(?:\s+|$)/;
// A test file named where a title belongs, with or without its line: `name.test.ts:23`, `name.test.ts` (the form a hashed label keeps).
const BASENAME_LABEL = /^[^`\s/]+\.(?:test|spec)\.[cm]?[jt]sx?(?::\d+)?$/;
const LINE_LABEL = /^L\d+$/;
// A file and line written where a title belongs: `name:23`, `` `name.test.ts:23` ``, either with a stray opening bracket.
const FILE_LINE_LABEL = /^[^\s]+:\d+$/;
const CONTENTLESS = /^[)\]}>,;]*$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

/** One `git diff -U0` hunk, in merge-base line numbers. */
export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

/** A `[label](path#Lnn)` link found in a markdown document. */
export interface AnchorLink {
  label: string;
  /** The href's path as written, `../` climb included. */
  linkPath: string;
  /** The `#Lnn` line number as written. */
  line: number;
  /** The first of `candidates`: the path the link is paired and reported by. */
  target: string;
  /** Where the href may point, repo-relative, in the order tried: beside the document for a `./` or `../` href, the repo root for a `/` href, the root then beside the document for a bare one. */
  candidates: string[];
  /** The paired merge-base link's line, or null when the branch added the link. */
  baseLine: number | null;
  /** The content hash the label ends with (`@a3f9c1d2`), or null. */
  hash: string | null;
  /** Whether the branch wrote the document line the link sits on: added it or changed it. */
  edited: boolean;
}

/** The lines a test declaration owns: from its opening line up to, not including, the next test or suite opening. */
export interface DeclarationSpan {
  start: number;
  end: number;
}

/** A test declaration: its normalised title and 1-based line. */
export interface TestDeclaration {
  title: string;
  line: number;
}

/** The working tree and diff as the re-anchor sees them. */
export interface ReanchorRepository {
  /** A repo-relative file's working-tree content, or null when it is not a file. */
  workingFile(path: string): string | null;
  /** The cited file's `git diff -U0` hunks from the merge base. */
  hunks(path: string): Hunk[];
  /** Whether the branch changed the file against the merge base. */
  isChanged(path: string): boolean;
  /** The file as it stood at the merge base, or null when the branch added it. */
  baseFile(path: string): string | null;
  /** The paths git says the branch renamed `path` to. */
  renamedTo(path: string): string[];
}

export interface ReanchorOptions {
  /** Report without rewriting; a stale or mislabelled link then fails. */
  check: boolean;
  /** Re-anchor links into files the branch did not change as well. */
  all: boolean;
  /** Give a link without a content hash the hash of the line it lands on. */
  addHashes?: boolean;
  /** With `addHashes`, give a hash even to a link into a file the branch did not change. */
  hashUnchanged?: boolean;
  /** Touch only links on document lines the branch wrote; every other link is left for a later pass. */
  authoredOnly?: boolean;
  testFilePattern?: RegExp;
}

export interface ReanchorReports {
  moved: string[];
  hashed: string[];
  renamed: string[];
  unmapped: string[];
  rotten: string[];
  mislabelled: string[];
}

export interface ReanchorTally {
  moved: number;
  hashed: number;
  renamed: number;
  upToDate: number;
  authored: number;
  outOfScope: number;
  relabelled: number;
  reports: ReanchorReports;
}

/** A markdown document and its merge-base copy (null when the branch added it). */
export interface ReanchorDocument {
  docPath: string;
  source: string;
  baseSource: string | null;
}

/** A link the re-anchor cannot repoint, found on `docLine` of the document. */
export interface ReanchorFinding {
  docLine: number;
  kind: "unmapped" | "rotten";
  detail: string;
}

export interface ReanchorResult {
  text: string;
  tally: ReanchorTally;
  /** The unmapped links, and the rotten ones the branch is answerable for: a link into a file it did not change is not. */
  findings: ReanchorFinding[];
}

// Where a link's outcome is recorded: the document's tally, its findings, and the line the link sits on.
interface LinkRecord {
  tally: ReanchorTally;
  findings: ReanchorFinding[];
  docLine: number;
}

export interface ReanchorReport {
  stdout: string;
  stderr: string[];
  exitCode: 0 | 1;
}

type Resolution =
  | { outOfScope: true }
  | { authored: true }
  | { failure: string }
  | {
      line: number;
      /** Where the link now points, when its file was renamed. */
      path?: string;
      /** The hash of the line the link now names, when its test was renamed. */
      hash?: string | null;
      renamed?: boolean;
    };

const lines = (text: string): string[] => text.split("\n");

// Where a titled link's hunk mapping puts it: the authored line, the mapped line, or the declaration.
function intendedLine(
  mapped: Resolution,
  authoredLine: number,
  declarationLine: number,
): number {
  if ("authored" in mapped) {
    return authoredLine;
  }

  return "line" in mapped ? mapped.line : declarationLine;
}

/** Parses `git diff -U0` output into hunks. */
export function parseHunks(diff: string): Hunk[] {
  return [...diff.matchAll(HUNK_HEADER)].map((match) => ({
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
  }));
}

/** A merge-base line's line in the working copy, or null when a hunk deleted or rewrote it. */
export function mapLine(line: number, hunks: readonly Hunk[]): number | null {
  let shift = 0;

  for (const hunk of hunks) {
    const insertionAfter = hunk.oldCount === 0 && line <= hunk.oldStart;

    if (insertionAfter || line < hunk.oldStart) {
      return line + shift;
    }

    if (line < hunk.oldStart + hunk.oldCount) {
      return null;
    }
    shift += hunk.newCount - hunk.oldCount;
  }

  return line + shift;
}

/** Collapses whitespace and unwraps a title written in backticks. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/^`([\s\S]*)`$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The test title a label may name, with any `validated by` or `implemented by` prefix removed:
 * null for an empty label, an `Lnn` label, a `file:NN` label and a label that opens with a stray bracket.
 */
export function titleOfLabel(label: string): string | null {
  const title = normalizeTitle(
    splitHashedLabel(label.trim()).text.replace(LABEL_PREFIX, ""),
  );
  const unnamed =
    title.length === 0 ||
    title.startsWith("[") ||
    LINE_LABEL.test(title) ||
    BASENAME_LABEL.test(title) ||
    FILE_LINE_LABEL.test(title.replace(/^`|`$/g, ""));

  return unnamed ? null : title;
}

/** Whether a label states the test it names, as `validated by <title>` or `implemented by <title>` does. */
export function claimsTitle(label: string): boolean {
  return LABEL_PREFIX.test(label.trim()) && titleOfLabel(label) !== null;
}

// A `./` or `../` href climbs from the document and a `/` href from the repo root; a bare href is read from the root, as specs write it, then beside the document, as GitHub renders it.
function candidatePaths(linkPath: string, docPath: string): string[] {
  const besideDocument = posix.normalize(
    posix.join(posix.dirname(docPath), linkPath),
  );
  const fromRoot = posix.normalize(linkPath.replace(/^\/+/, ""));

  if (/^\.\.?\//.test(linkPath)) {
    return [besideDocument];
  }

  if (linkPath.startsWith("/")) {
    return [fromRoot];
  }

  return [...new Set([fromRoot, besideDocument])];
}

// How many lines past an opening a title may sit: room for an `it.each` table.
const DECLARATION_REACH = 40;

// The title of the declaration opening at `index`, read from the opening line alone or from the lines prettier wrapped it over, never from the next test.
function declarationAt(
  sourceLines: readonly string[],
  index: number,
): TestDeclaration | null {
  if (
    !TEST_OPENING.test(sourceLines[index]) ||
    GROUPING_OPENING.test(sourceLines[index])
  ) {
    return null;
  }

  for (let end = index; end <= index + DECLARATION_REACH; end += 1) {
    const reachedNextOpening =
      end > index &&
      (end >= sourceLines.length ||
        TEST_OPENING.test(sourceLines[end]) ||
        SUITE_OPENING.test(sourceLines[end]));

    if (reachedNextOpening) {
      return null;
    }
    const match = DECLARATION.exec(sourceLines.slice(index, end + 1).join(" "));

    if (match) {
      return {
        title: normalizeTitle(match[2].replace(/\\(.)/g, "$1")),
        line: index + 1,
      };
    }
  }

  return null;
}

/** Every `it()`/`test()` declaration in a test file's source, its title read from the opening line or the lines it wraps over. `test.describe()`, `test.suite()` and `test.step()` are not declarations. */
export function findTestDeclarations(source: string): TestDeclaration[] {
  const sourceLines = lines(source);

  return sourceLines.flatMap((_, index) => {
    const declaration = declarationAt(sourceLines, index);

    return declaration ? [declaration] : [];
  });
}

/**
 * The span of every `it()`/`test()` opening line, `it.each` and tagged-template forms included.
 * Braces are never counted: a span runs to the next test or `describe` opening, so an anchor on a
 * helper between two tests lands in the earlier one.
 */
export function declarationSpans(source: string): DeclarationSpan[] {
  const sourceLines = lines(source);
  const openings = sourceLines.flatMap((text, index) =>
    TEST_OPENING.test(text) || SUITE_OPENING.test(text)
      ? [{ line: index + 1, isTest: TEST_OPENING.test(text) }]
      : [],
  );

  return openings.flatMap((opening, index) =>
    opening.isTest
      ? [
          {
            start: opening.line,
            end: openings[index + 1]?.line ?? sourceLines.length + 1,
          },
        ]
      : [],
  );
}

/** Whether `line` falls inside any of the spans. */
export function spansCover(
  spans: readonly DeclarationSpan[],
  line: number,
): boolean {
  return spans.some((span) => line >= span.start && line < span.end);
}

/** The anchor links on each line of a document, one array per line. */
export function anchorLinksIn(
  markdownLines: readonly string[],
  docPath: string,
): AnchorLink[][] {
  return markdownLines.map((text) =>
    [...text.matchAll(ANCHOR_LINK)].map((match) => {
      const candidates = candidatePaths(match[2], docPath);

      return {
        label: match[1],
        linkPath: match[2],
        line: Number(match[3]),
        target: candidates[0],
        candidates,
        baseLine: null,
        hash: splitHashedLabel(match[1]).hash,
        edited: true,
      };
    }),
  );
}

// Every #Lnn, [Lnnn] label and @hash blanked, so the re-anchor's own rewrites never unpair a line from its merge-base copy.
const comparable = (text: string): string =>
  text
    .replace(/#L\d+\)/g, "#L)")
    .replace(/\s*@[0-9a-f]{8}(?=`?\]\()/g, "")
    .replace(/\[L\d+\]\(/g, "[L](");

const pairKey = (link: AnchorLink): string => {
  const { text } = splitHashedLabel(link.label);

  return `${LINE_LABEL.test(text) ? "L" : text}\0${link.target}`;
};

// Longest common subsequence of the two documents' comparable lines, as [baseIndex, workingIndex] pairs.
function matchedLines(
  baseLines: readonly string[],
  workingLines: readonly string[],
): [number, number][] {
  const base = baseLines.map(comparable);
  const working = workingLines.map(comparable);
  const table = Array.from(
    { length: base.length + 1 },
    () => new Uint32Array(working.length + 1),
  );

  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = working.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        base[i] === working[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;

  while (i < base.length && j < working.length) {
    if (base[i] === working[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return pairs;
}

function groupByPairKey(links: AnchorLink[]): Map<string, AnchorLink[]> {
  const groups = new Map<string, AnchorLink[]>();

  for (const link of links) {
    groups.set(pairKey(link), [...(groups.get(pairKey(link)) ?? []), link]);
  }

  return groups;
}

/**
 * Pairs each working link with its merge-base copy and returns the links with `baseLine` set.
 * Links on an unchanged line pair by position; links in an edited stretch pair by label and
 * target, in order, only when both sides carry the same number of them.
 */
export function pairWithBase(
  workingLinks: readonly AnchorLink[][],
  baseLinks: readonly AnchorLink[][],
  baseLines: readonly string[],
  workingLines: readonly string[],
): AnchorLink[][] {
  const matched = matchedLines(baseLines, workingLines);
  const unchanged = new Set(matched.map(([, workingIndex]) => workingIndex));
  const paired = workingLinks.map((onLine, workingIndex) =>
    onLine.map((link) => ({
      ...link,
      baseLine: null as number | null,
      edited: !unchanged.has(workingIndex),
    })),
  );
  const anchors = [...matched, [baseLines.length, workingLines.length]];
  let previous = [-1, -1];

  for (const [baseIndex, workingIndex] of anchors) {
    const baseGroups = groupByPairKey(
      baseLinks.slice(previous[0] + 1, baseIndex).flat(),
    );
    const workingGroups = groupByPairKey(
      paired.slice(previous[1] + 1, workingIndex).flat(),
    );

    for (const [key, group] of workingGroups) {
      const baseGroup = baseGroups.get(key) ?? [];

      if (baseGroup.length === group.length) {
        group.forEach((link, index) => (link.baseLine = baseGroup[index].line));
      }
    }
    (paired[workingIndex] ?? []).forEach(
      (link, index) => (link.baseLine = baseLinks[baseIndex][index].line),
    );
    previous = [baseIndex, workingIndex];
  }

  return paired;
}

/** Why an anchor does not land on a content-carrying line of an existing file, or null when it does. */
export function rottenReason(
  target: string,
  content: string | null,
  line: number,
): string | null {
  if (content === null) {
    return `${target} does not exist in the working tree`;
  }
  const text = lines(content)[line - 1];

  if (text === undefined) {
    return `#L${line} is beyond the end of ${target}`;
  }

  return CONTENTLESS.test(text.trim())
    ? `#L${line} lands on a blank or closing line`
    : null;
}

/** The label a link should carry at `line`: a bare `Lnnn` follows its href, any other label stays; given a hash, the label ends with it. */
export function syncedLabel(
  label: string,
  line: number,
  hash: string | null = null,
): string {
  const { text } = splitHashedLabel(label);
  const synced = LINE_LABEL.test(text) ? `L${line}` : text;

  if (hash !== null) {
    return withAnchorHash(synced, hash);
  }

  return synced === text ? label : synced;
}

/** The href path for a link moved into `path`, written the way the old href was: climbing from the document, from the root, or bare. */
export function relinkedPath(
  linkPath: string,
  path: string,
  docPath: string,
): string {
  if (/^\.\.?\//.test(linkPath)) {
    const climb = posix.relative(posix.dirname(docPath), path);

    return climb.startsWith(".") ? climb : `./${climb}`;
  }

  return linkPath.startsWith("/") ? `/${path}` : path;
}

/** A glob with `**`, `*` and `?` as an anchored regular expression over repo-relative paths. */
export function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      const wildcards: Record<string, string> = {
        "**/": "(?:.*/)?",
        "**": ".*",
        "*": "[^/]*",
        "?": "[^/]",
      };

      return wildcards[part] ?? part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    })
    .join("");

  return new RegExp(`^${source}$`);
}

/** The paths each pattern matches, sorted per pattern, patterns in order, each path once. */
export function selectCorpus(
  paths: readonly string[],
  patterns: readonly string[],
): string[] {
  const selected = patterns.flatMap((pattern) => {
    const matcher = globToRegExp(pattern);

    return paths.filter((path) => matcher.test(path)).sort();
  });

  return [...new Set(selected)];
}

export function emptyTally(): ReanchorTally {
  return {
    moved: 0,
    hashed: 0,
    renamed: 0,
    upToDate: 0,
    authored: 0,
    outOfScope: 0,
    relabelled: 0,
    reports: {
      moved: [],
      hashed: [],
      renamed: [],
      unmapped: [],
      rotten: [],
      mislabelled: [],
    },
  };
}

export function addTallies(
  first: ReanchorTally,
  second: ReanchorTally,
): ReanchorTally {
  return {
    moved: first.moved + second.moved,
    hashed: first.hashed + second.hashed,
    renamed: first.renamed + second.renamed,
    upToDate: first.upToDate + second.upToDate,
    authored: first.authored + second.authored,
    outOfScope: first.outOfScope + second.outOfScope,
    relabelled: first.relabelled + second.relabelled,
    reports: {
      moved: [...first.reports.moved, ...second.reports.moved],
      hashed: [...first.reports.hashed, ...second.reports.hashed],
      renamed: [...first.reports.renamed, ...second.reports.renamed],
      unmapped: [...first.reports.unmapped, ...second.reports.unmapped],
      rotten: [...first.reports.rotten, ...second.reports.rotten],
      mislabelled: [
        ...first.reports.mislabelled,
        ...second.reports.mislabelled,
      ],
    },
  };
}

/**
 * Binds a repository and options to a document re-anchorer. A link into a test file whose label
 * names a test moves to the one declaration carrying that title, unless its hunk-mapped anchor
 * still lies inside that test; a `validated by` or `implemented by` title no declaration carries
 * is reported, a bare label naming no test falls back to the hunks. Every other link is mapped
 * through the cited file's hunks from its paired merge-base line. A link the branch added or
 * whose href it edited by hand is kept as authored. Out of scope, a link is left alone unless
 * its label names one test and its anchor lies in another test's span: that link moves to the
 * test it names, since read by span it would be evidence for the wrong test.
 */
export function createReanchorer(
  repository: ReanchorRepository,
  options: ReanchorOptions,
): (document: ReanchorDocument) => ReanchorResult {
  const testFilePattern = options.testFilePattern ?? DEFAULT_TEST_FILE_PATTERN;
  const sourceCache = new Map<
    string,
    { declarations: TestDeclaration[]; spans: DeclarationSpan[] }
  >();

  const declarationsIn = (path: string) => {
    if (!sourceCache.has(path)) {
      const source = repository.workingFile(path) ?? "";

      sourceCache.set(path, {
        declarations: findTestDeclarations(source),
        spans: declarationSpans(source),
      });
    }

    return sourceCache.get(path) ?? { declarations: [], spans: [] };
  };

  const byHunks = (link: AnchorLink): Resolution => {
    if (link.baseLine === null) {
      return { authored: true };
    }
    const mapped = mapLine(link.baseLine, repository.hunks(link.target));
    const untouched = link.line === link.baseLine;

    if (mapped === null) {
      return untouched
        ? {
            failure: `#L${link.baseLine} was deleted or rewritten on this branch`,
          }
        : { authored: true };
    }

    return untouched || link.line === mapped
      ? { line: mapped }
      : { authored: true };
  };

  const locate = (link: AnchorLink): AnchorLink => ({
    ...link,
    target:
      link.candidates.find(
        (candidate) => repository.workingFile(candidate) !== null,
      ) ?? link.target,
  });

  // The declarations carrying the title a link's label names, or null when the label names none or the target is no test file.
  const titledDeclarations = (link: AnchorLink) => {
    const title = titleOfLabel(link.label);

    if (title === null || !testFilePattern.test(link.target)) {
      return null;
    }
    const { declarations, spans } = declarationsIn(link.target);

    return {
      title,
      spans,
      matches: declarations.filter(
        (declaration) => declaration.title === title,
      ),
    };
  };

  const byTitle = (link: AnchorLink): Resolution | null => {
    const titled = titledDeclarations(link);

    if (titled === null) {
      return null;
    }
    const { title, spans, matches } = titled;

    if (matches.length > 1) {
      return { failure: `several tests carry the title "${title}"` };
    }

    if (matches.length === 0) {
      return claimsTitle(link.label)
        ? { failure: `no test in ${link.target} carries the title "${title}"` }
        : null;
    }
    const start = matches[0].line;
    const end = spans.find((span) => span.start === start)?.end ?? Infinity;
    const intended = intendedLine(byHunks(link), link.line, start);

    return { line: intended >= start && intended < end ? intended : start };
  };

  // The one test a titled link names, when its anchor sits inside another test.
  const strayTitled = (link: AnchorLink): Resolution | null => {
    const titled = titledDeclarations(link);

    if (titled === null || titled.matches.length !== 1) {
      return null;
    }
    const named = titled.matches[0].line;
    const landedIn = titled.spans.find(
      (span) => link.line >= span.start && link.line < span.end,
    );
    const stray = landedIn !== undefined && landedIn.start !== named;

    return stray ? { line: named } : null;
  };

  // The files a link may now point into: its own, then wherever the branch renamed it.
  const filesFor = (target: string): AnchorFile[] =>
    [target, ...repository.renamedTo(target)].flatMap((path) => {
      const source = repository.workingFile(path);

      return source === null ? [] : [{ path, source }];
    });

  // The line at the merge base that carried the link's hash, nearest where the link stood.
  const oldLineOf = (link: AnchorLink, hash: string) => {
    const base = repository.baseFile(link.target);
    const line =
      base === null
        ? null
        : nearestLine(linesWithHash(base, hash), link.baseLine ?? link.line);

    return base === null || line === null
      ? null
      : { line, text: lines(base)[line - 1] };
  };

  // A hashed link: follow the hash; failing that, the line the branch rewrote it into, then the most similar line.
  const byHash = (link: AnchorLink, hash: string): Resolution => {
    const files = filesFor(link.target);
    const found = findHash(files, hash, link.line);

    if (found !== null) {
      return { line: found.line, path: found.path };
    }
    const old = oldLineOf(link, hash);

    if (old === null) {
      return {
        failure: `no line of ${link.target} carries @${hash}, here or at the merge base`,
      };
    }
    const own = files.find((file) => file.path === link.target);
    const healed =
      (own && rewrittenInPlace(own, repository.hunks(link.target), old)) ??
      mostSimilar(files, old.text);

    return healed === null
      ? { failure: `the line @${hash} named was rewritten beyond recognition` }
      : {
          line: healed.line,
          path: healed.path,
          hash: anchorHashOf(healed.text),
          renamed: true,
        };
  };

  const resolve = (link: AnchorLink): Resolution => {
    // A link on a line the branch wrote is the branch's to get right, whatever file it cites.
    const inScope =
      options.all ||
      (options.authoredOnly === true && link.edited) ||
      repository.isChanged(link.target);

    if (link.hash !== null) {
      return inScope ? byHash(link, link.hash) : { outOfScope: true };
    }

    return inScope
      ? (byTitle(link) ?? byHunks(link))
      : (strayTitled(link) ?? { outOfScope: true });
  };

  // The hash the link should carry at `line` of `path`: a new one when the test was renamed, its own, or a first one for a link without.
  const hashFor = (
    link: AnchorLink,
    resolution: Resolution,
    at: { path: string; line: number },
  ): string | null => {
    if ("hash" in resolution && resolution.hash) {
      return resolution.hash;
    }
    const mayAddHash =
      options.addHashes === true &&
      !("failure" in resolution) &&
      (!("outOfScope" in resolution) || options.hashUnchanged === true);

    if (link.hash !== null || !mayAddHash) {
      return link.hash;
    }
    const text = lines(repository.workingFile(at.path) ?? "")[at.line - 1];

    return text === undefined ? null : anchorHashOf(text);
  };

  const rewriteLink = (
    written: AnchorLink,
    docPath: string,
    { tally, findings, docLine }: LinkRecord,
  ): string => {
    const link = locate(written);
    const here = `${link.linkPath}#L${link.line}`;
    const where = `${docPath}: ${here}`;

    if (options.authoredOnly === true && !link.edited) {
      tally.outOfScope += 1;

      return `[${link.label}](${here})`;
    }
    const resolution = resolve(link);
    const line = "line" in resolution ? resolution.line : link.line;
    const path =
      "line" in resolution && resolution.path ? resolution.path : link.target;
    const linkPath =
      path === link.target
        ? link.linkPath
        : relinkedPath(link.linkPath, path, docPath);
    const hash = hashFor(link, resolution, { path, line });
    const moved = line !== link.line || linkPath !== link.linkPath;

    if ("outOfScope" in resolution) {
      tally.outOfScope += 1;
    } else if ("authored" in resolution) {
      tally.authored += 1;
    } else if ("failure" in resolution) {
      tally.reports.unmapped.push(`${where} -> ${resolution.failure}`);
      findings.push({
        docLine,
        kind: "unmapped",
        detail: `${here} -> ${resolution.failure}`,
      });
    } else if ("renamed" in resolution && resolution.renamed) {
      tally.renamed += 1;
      tally.reports.renamed.push(`${where} -> ${linkPath}#L${line} @${hash}`);
    } else if (moved) {
      tally.moved += 1;
      tally.reports.moved.push(
        `${where} -> ${linkPath === link.linkPath ? "" : linkPath}#L${line}`,
      );
    } else {
      tally.upToDate += 1;
    }

    if (link.hash === null && hash !== null) {
      tally.hashed += 1;
      tally.reports.hashed.push(`${where} -> @${hash}`);
    }
    const reason = rottenReason(path, repository.workingFile(path), line);

    if (reason !== null) {
      tally.reports.rotten.push(`${where} -> ${reason}`);

      if (!("outOfScope" in resolution)) {
        findings.push({
          docLine,
          kind: "rotten",
          detail: `${here} -> ${reason}`,
        });
      }
    }

    if (syncedLabel(link.label, link.line) !== link.label) {
      tally.reports.mislabelled.push(`${where} -> label reads ${link.label}`);
    }
    const label = syncedLabel(link.label, line, hash);

    if (splitHashedLabel(label).text !== splitHashedLabel(link.label).text) {
      tally.relabelled += 1;
    }

    return `[${label}](${linkPath}#L${line})`;
  };

  return ({ docPath, source, baseSource }) => {
    const workingLines = lines(source);
    const baseLines = baseSource === null ? [] : lines(baseSource);
    const links = pairWithBase(
      anchorLinksIn(workingLines, docPath),
      anchorLinksIn(baseLines, docPath),
      baseLines,
      workingLines,
    );
    const tally = emptyTally();
    const findings: ReanchorFinding[] = [];
    const rewritten = workingLines.map((text, lineIndex) => {
      let position = -1;

      return text.replace(ANCHOR_LINK, (whole) => {
        position += 1;
        const replacement = rewriteLink(links[lineIndex][position], docPath, {
          tally,
          findings,
          docLine: lineIndex + 1,
        });

        return options.check ? whole : replacement;
      });
    });

    return {
      text: options.check ? source : rewritten.join("\n"),
      tally,
      findings,
    };
  };
}

/** The summary line, one stderr line per finding, and the exit code for a finished run. */
export function formatReanchorReport(
  tally: ReanchorTally,
  check: boolean,
): ReanchorReport {
  const movedWord = check ? "stale" : "re-anchored";
  const labelWord = check ? "mislabelled" : "relabelled";
  const { reports } = tally;
  const findings: [string, string[]][] = [
    [movedWord, reports.moved],
    [check ? "unhashed" : "hashed", reports.hashed],
    ["renamed", reports.renamed],
    ["unmapped", reports.unmapped],
    ["rotten", reports.rotten],
    ...(check
      ? ([["mislabelled", reports.mislabelled]] as [string, string[]][])
      : []),
  ];
  const changes =
    reports.moved.length +
    reports.hashed.length +
    reports.renamed.length +
    reports.mislabelled.length;
  const stale = check && changes > 0;
  const broken = reports.unmapped.length + reports.rotten.length > 0;

  return {
    stdout:
      `${movedWord}: ${tally.moved}, up to date: ${tally.upToDate}, ` +
      `kept as authored: ${tally.authored}, out of scope: ${tally.outOfScope}, ` +
      `unmapped: ${reports.unmapped.length}, rotten: ${reports.rotten.length}, ` +
      `${labelWord}: ${check ? reports.mislabelled.length : tally.relabelled}, ` +
      `${check ? "unhashed" : "hashed"}: ${tally.hashed}, renamed: ${tally.renamed}\n`,
    stderr: findings.flatMap(([kind, details]) =>
      details.map((detail) => `${kind} ${detail}\n`),
    ),
    exitCode: broken || stale ? 1 : 0,
  };
}
