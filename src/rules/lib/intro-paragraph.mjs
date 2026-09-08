/**
 * intro-paragraph — the pure core behind `require-intro-paragraph`.
 *
 * The web-UI spec/ADR cards render a short description drawn from the top of each
 * doc; a doc that opens straight into a metadata table, a bare `## Status` word,
 * or a `## Section` heading gives the card nothing good to show. This checks that a
 * doc opens with a real *lead paragraph* — prose sitting after the title (and, for
 * specs, the metadata table / for ADRs, the frontmatter) and BEFORE the first `##`
 * section.
 *
 * A region-bounded cousin of `extractSummary` (@re-cinq/lore-shared/spec-summary):
 * that one grabs the first prose paragraph anywhere in the doc; here the prose must
 * fall in the intro region, so the placement — not just the existence — is enforced.
 *
 * Split out of the rule so it is testable without a RuleTester.
 */

const MIN_INTRO_CHARS = 40;

/** Markdown structure openers: heading, table row, blockquote, code fence, bullet
 * or ordered list item, or a `**Status:** …` metadata line. */
const STRUCTURE_PATTERNS = [
  /^#/,
  /^\|/,
  /^>/,
  /^```/,
  /^(\d+\.|[-*+])\s/,
  /^\*\*status\b/i,
];

const SECTION_HEADING = /^##\s/;
const FRONTMATTER_FENCE = "---";

function isProseLine(line) {
  const trimmed = line.trim();
  if (trimmed === "") {
    return false;
  }
  return !STRUCTURE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Index of the first line after a leading `---` … `---` frontmatter block. A
 * missing closing `---` yields an index past the last line, so the region is
 * empty and the rule fires — the right answer for malformed frontmatter. */
function frontmatterEnd(lines) {
  if (lines[0]?.trim() !== FRONTMATTER_FENCE) {
    return 0;
  }
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONTMATTER_FENCE,
  );
  return closing === -1 ? lines.length + 1 : closing + 1;
}

/** The intro region is every line before the first `## ` section, past any leading
 * `---` … `---` frontmatter (ADRs). */
function introRegion(content, kind) {
  const lines = content.split("\n");
  const start = kind === "adr" ? frontmatterEnd(lines) : 0;
  const body = lines.slice(start);
  const firstSection = body.findIndex((line) => SECTION_HEADING.test(line));
  return firstSection === -1 ? body : body.slice(0, firstSection);
}

function meetsMinimum(paragraph) {
  const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
  return text.length >= MIN_INTRO_CHARS;
}

/** A blockquote is lazily continued by wrapped lines that drop the leading `>`;
 * the quote runs until a blank line. */
function blockquoteStateAfter(inBlockquote, trimmed) {
  if (trimmed === "") {
    return false;
  }
  return inBlockquote || trimmed.startsWith(">");
}

/**
 * @param {string} content markdown body of a spec.md / ADR file
 * @param {"spec" | "adr"} kind
 * @returns {boolean} true when a lead paragraph of at least MIN_INTRO_CHARS exists
 */
export function hasLeadParagraph(content, kind) {
  let paragraph = [];
  let inBlockquote = false;

  for (const line of introRegion(content, kind)) {
    const trimmed = line.trim();
    inBlockquote = blockquoteStateAfter(inBlockquote, trimmed);
    const isLazyBlockquoteLine = inBlockquote && !trimmed.startsWith(">");

    // Only prose accumulates. A blank or structural line closes the current
    // paragraph — it must never pad a too-short intro toward the minimum.
    if (!isLazyBlockquoteLine && isProseLine(line)) {
      paragraph.push(trimmed);
      continue;
    }

    if (meetsMinimum(paragraph)) {
      return true;
    }
    paragraph = [];
  }

  return meetsMinimum(paragraph);
}
