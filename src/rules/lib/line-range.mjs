/**
 * line-range — character offsets of one line of a document, so a fixer can
 * replace just that line instead of the whole file. Two fixes that touch
 * different lines then apply in the same ESLint pass.
 */

/** [start, end) of a 1-based line, its line terminator excluded. */
export function lineRange(text, lineNumber) {
  const lines = text.split("\n");
  const start = lines
    .slice(0, lineNumber - 1)
    .reduce((offset, line) => offset + line.length + 1, 0);
  const length = lines[lineNumber - 1].replace(/\r$/, "").length;

  return [start, start + length];
}

/** The document with line `lineNumber` replaced by `replacement`. */
export function replaceLine(text, lineNumber, replacement) {
  const [start, end] = lineRange(text, lineNumber);

  return text.slice(0, start) + replacement + text.slice(end);
}
