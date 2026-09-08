/**
 * Pure view over a jscpd JSON report. Every duplicate names two files; each
 * side becomes one clone keyed by its own absolute path and carrying the
 * other side as `twin`, so a rule can look up "what in THIS file is copied"
 * without re-walking the report. jscpd columns are already 0-based, which is
 * what ESLint `loc` expects.
 */

function toLoc(side) {
  return { line: side.startLoc.line, column: side.startLoc.column };
}

function toEndLoc(side) {
  return { line: side.endLoc.line, column: side.endLoc.column };
}

function toTwin(side) {
  return { file: side.name, startLine: side.start, endLine: side.end };
}

function toClone(side, other, duplicate) {
  return {
    file: side.name,
    start: toLoc(side),
    end: toEndLoc(side),
    twin: toTwin(other),
    lines: duplicate.lines,
    tokens: duplicate.tokens,
  };
}

function append(byFile, clone) {
  const existing = byFile.get(clone.file) ?? [];
  byFile.set(clone.file, [...existing, clone]);
}

export function indexClones(report) {
  const byFile = new Map();

  for (const duplicate of report.duplicates ?? []) {
    const { firstFile, secondFile } = duplicate;
    append(byFile, toClone(firstFile, secondFile, duplicate));
    append(byFile, toClone(secondFile, firstFile, duplicate));
  }

  return byFile;
}
