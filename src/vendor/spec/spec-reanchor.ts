// Pure logic behind `re-lint-reanchor`: heals the `[label](../path#Lnn)` links in spec markdown after a branch edits a cited file. Git and fs access stay in the CLI, behind `ReanchorRepository`.
import { posix } from "node:path";

/** The documents a corpus scan reads when no pattern is given, in report order. */
export const DEFAULT_CORPUS: readonly string[] = [
  "specs/**/spec.md",
  ".specify/spec.md",
  "adrs/*.md",
];

/** Files whose `it()`/`test()` declarations a titled link can relocate to. */
export const DEFAULT_TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

const ANCHOR_LINK = /\[([^\]]*)\]\(((?:\.\.\/)+[^)#\s]+)#L(\d+)\)/g;
const DECLARATION =
  /^\s*(?:it|test)(?:\.(?:only|skip|todo|concurrent|sequential|fails))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const TITLED_LABEL = /^validated by\s+(\S[\s\S]*)$/;
const LINE_LABEL = /^L\d+$/;
const CONTENTLESS = /^[)\]}>,;]*$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

/** One `git diff -U0` hunk, in merge-base line numbers. */
export interface Hunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
}

/** A `[label](../path#Lnn)` link found in a markdown document. */
export interface AnchorLink {
  label: string;
  /** The href's path as written, `../` climb included. */
  linkPath: string;
  /** The `#Lnn` line number as written. */
  line: number;
  /** The href resolved against the document's directory, repo-relative. */
  target: string;
  /** The paired merge-base link's line, or null when the branch added the link. */
  baseLine: number | null;
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
}

export interface ReanchorOptions {
  /** Report without rewriting; a stale or mislabelled link then fails. */
  check: boolean;
  /** Re-anchor links into files the branch did not change as well. */
  all: boolean;
  testFilePattern?: RegExp;
}

export interface ReanchorReports {
  moved: string[];
  unmapped: string[];
  rotten: string[];
  mislabelled: string[];
}

export interface ReanchorTally {
  moved: number;
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

export interface ReanchorResult {
  text: string;
  tally: ReanchorTally;
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
  | { line: number };

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

/** The test title a `validated by <title>` label names, or null for any other label. */
export function titleOfLabel(label: string): string | null {
  const match = TITLED_LABEL.exec(label.trim());

  return match ? normalizeTitle(match[1]) : null;
}

/** Every single-line `it()`/`test()` declaration in a test file's source. */
export function findTestDeclarations(source: string): TestDeclaration[] {
  return lines(source).flatMap((text, index) => {
    const match = DECLARATION.exec(text);

    return match
      ? [
          {
            title: normalizeTitle(match[2].replace(/\\(.)/g, "$1")),
            line: index + 1,
          },
        ]
      : [];
  });
}

/** The anchor links on each line of a document, one array per line. */
export function anchorLinksIn(
  markdownLines: readonly string[],
  docPath: string,
): AnchorLink[][] {
  return markdownLines.map((text) =>
    [...text.matchAll(ANCHOR_LINK)].map((match) => ({
      label: match[1],
      linkPath: match[2],
      line: Number(match[3]),
      target: posix.normalize(posix.join(posix.dirname(docPath), match[2])),
      baseLine: null,
    })),
  );
}

// Every #Lnn and [Lnnn] label blanked, so the re-anchor's own rewrites never unpair a line from its merge-base copy.
const comparable = (text: string): string =>
  text.replace(/#L\d+\)/g, "#L)").replace(/\[L\d+\]\(/g, "[L](");

const pairKey = (link: AnchorLink): string =>
  `${LINE_LABEL.test(link.label) ? "L" : link.label}\0${link.target}`;

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
  const paired = workingLinks.map((onLine) =>
    onLine.map((link) => ({ ...link, baseLine: null as number | null })),
  );
  const anchors = [
    ...matchedLines(baseLines, workingLines),
    [baseLines.length, workingLines.length],
  ];
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

/** The label a link should carry at `line`: a bare `Lnnn` follows its href, any other label stays. */
export function syncedLabel(label: string, line: number): string {
  return LINE_LABEL.test(label) ? `L${line}` : label;
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
    upToDate: 0,
    authored: 0,
    outOfScope: 0,
    relabelled: 0,
    reports: { moved: [], unmapped: [], rotten: [], mislabelled: [] },
  };
}

export function addTallies(
  first: ReanchorTally,
  second: ReanchorTally,
): ReanchorTally {
  return {
    moved: first.moved + second.moved,
    upToDate: first.upToDate + second.upToDate,
    authored: first.authored + second.authored,
    outOfScope: first.outOfScope + second.outOfScope,
    relabelled: first.relabelled + second.relabelled,
    reports: {
      moved: [...first.reports.moved, ...second.reports.moved],
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
 * Binds a repository and options to a document re-anchorer. A `validated by <title>` link into a
 * test file moves to the one declaration carrying that title, unless its hunk-mapped anchor still
 * lies inside that test; every other link is mapped through the cited file's hunks from its paired
 * merge-base line. A link the branch added or whose href it edited by hand is kept as authored.
 */
export function createReanchorer(
  repository: ReanchorRepository,
  options: ReanchorOptions,
): (document: ReanchorDocument) => ReanchorResult {
  const testFilePattern = options.testFilePattern ?? DEFAULT_TEST_FILE_PATTERN;
  const declarationCache = new Map<string, TestDeclaration[]>();

  const declarationsIn = (path: string): TestDeclaration[] => {
    if (!declarationCache.has(path)) {
      declarationCache.set(
        path,
        findTestDeclarations(repository.workingFile(path) ?? ""),
      );
    }

    return declarationCache.get(path) ?? [];
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

  const byTitle = (link: AnchorLink): Resolution | null => {
    const title = titleOfLabel(link.label);

    if (title === null || !testFilePattern.test(link.target)) {
      return null;
    }
    const declarations = declarationsIn(link.target);
    const index = declarations.findIndex(
      (declaration) => declaration.title === title,
    );

    if (index === -1) {
      return null;
    }

    if (
      declarations.filter((declaration) => declaration.title === title).length >
      1
    ) {
      return { failure: `several tests carry the title "${title}"` };
    }
    const start = declarations[index].line;
    const end = declarations[index + 1]?.line ?? Infinity;
    const intended = intendedLine(byHunks(link), link.line, start);

    return { line: intended >= start && intended < end ? intended : start };
  };

  const resolve = (link: AnchorLink): Resolution =>
    !options.all && !repository.isChanged(link.target)
      ? { outOfScope: true }
      : (byTitle(link) ?? byHunks(link));

  const rewriteLink = (
    link: AnchorLink,
    docPath: string,
    tally: ReanchorTally,
  ): string => {
    const resolution = resolve(link);
    const where = `${docPath}: ${link.linkPath}#L${link.line}`;
    const line = "line" in resolution ? resolution.line : link.line;

    if ("outOfScope" in resolution) {
      tally.outOfScope += 1;
    } else if ("authored" in resolution) {
      tally.authored += 1;
    } else if ("failure" in resolution) {
      tally.reports.unmapped.push(`${where} -> ${resolution.failure}`);
    } else if (line === link.line) {
      tally.upToDate += 1;
    } else {
      tally.moved += 1;
      tally.reports.moved.push(`${where} -> #L${line}`);
    }
    const reason = rottenReason(
      link.target,
      repository.workingFile(link.target),
      line,
    );

    if (reason !== null) {
      tally.reports.rotten.push(`${where} -> ${reason}`);
    }

    if (syncedLabel(link.label, link.line) !== link.label) {
      tally.reports.mislabelled.push(`${where} -> label reads ${link.label}`);
    }
    const label = syncedLabel(link.label, line);

    if (label !== link.label) {
      tally.relabelled += 1;
    }

    return `[${label}](${link.linkPath}#L${line})`;
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
    const rewritten = workingLines.map((text, lineIndex) => {
      let position = -1;

      return text.replace(ANCHOR_LINK, (whole) => {
        position += 1;
        const replacement = rewriteLink(
          links[lineIndex][position],
          docPath,
          tally,
        );

        return options.check ? whole : replacement;
      });
    });

    return { text: options.check ? source : rewritten.join("\n"), tally };
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
    ["unmapped", reports.unmapped],
    ["rotten", reports.rotten],
    ...(check
      ? ([["mislabelled", reports.mislabelled]] as [string, string[]][])
      : []),
  ];
  const stale = check && reports.moved.length + reports.mislabelled.length > 0;
  const broken = reports.unmapped.length + reports.rotten.length > 0;

  return {
    stdout:
      `${movedWord}: ${tally.moved}, up to date: ${tally.upToDate}, ` +
      `kept as authored: ${tally.authored}, out of scope: ${tally.outOfScope}, ` +
      `unmapped: ${reports.unmapped.length}, rotten: ${reports.rotten.length}, ` +
      `${labelWord}: ${check ? reports.mislabelled.length : tally.relabelled}\n`,
    stderr: findings.flatMap(([kind, details]) =>
      details.map((detail) => `${kind} ${detail}\n`),
    ),
    exitCode: broken || stale ? 1 : 0,
  };
}
