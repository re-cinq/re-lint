/**
 * no-duplicate-code — flags every block jscpd reports as copied from
 * elsewhere in the scanned roots, spanning the whole duplicated range so an
 * editor highlights exactly what was pasted.
 *
 * jscpd is a whole-tree scanner, so one scan per process serves every file:
 * the index is cached per `cwd` + options. An editor ESLint server keeps its
 * process alive across saves, so a rescan happens when the linted file, or
 * the twin of any clone reported in it, has an mtime newer than the cached
 * scan — that is how a just-removed clone stops being reported on BOTH sides
 * without a restart. A clone newly introduced by editing some other file is
 * seen once that file is linted; the file at hand was not part of it before.
 *
 * `roots` are directories: jscpd walks them itself and treats a glob as a
 * path that does not exist, scanning nothing, so a missing root is reported
 * instead of silently passing.
 */

import { statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { resolveJscpdBin, runJscpd } from "./lib/jscpd/runner.mjs";

/** Below this much real code, a match is a shared dependency list with spillover, not duplicated logic. */
const MIN_CODE_LINES = 3;

const IMPORT_LINE = /^(import|export)\b[^;]*(from\s|["'])/;
const CONTINUATION_LINE = /^[\w$*{},\s]*(\}\s*from\s|["']|,)?[;,]?$/;

const scans = new Map();
const reportedUnavailable = new Set();

function cacheKey(cwd, options) {
  return `${cwd}\n${JSON.stringify(options)}`;
}

function scan(cwd, options) {
  const bin = resolveJscpdBin(cwd, options.jscpdBin);
  return runJscpd({
    cwd,
    bin,
    roots: options.roots ?? ["."],
    minTokens: options.minTokens ?? 50,
    minLines: options.minLines,
    mode: options.mode,
    ignore: options.ignore,
    formats: options.formats,
  });
}

function fileChangedSince(filename, startedAt) {
  try {
    return statSync(filename).mtimeMs > startedAt;
  } catch {
    return false;
  }
}

function isStale(entry, filename) {
  const startedAt = entry.startedAt ?? 0;
  const twins = (entry.byFile?.get(filename) ?? []).map(
    (clone) => clone.twin.file,
  );
  return [filename, ...twins].some((path) => fileChangedSince(path, startedAt));
}

function scanFor(cwd, options, filename) {
  const key = cacheKey(cwd, options);
  const cached = scans.get(key);
  if (cached && !isStale(cached, filename)) {
    return { key, entry: cached };
  }

  const entry = scan(cwd, options);
  scans.set(key, entry);
  return { key, entry };
}

function reportUnavailable(context, key, error) {
  if (reportedUnavailable.has(key)) {
    return;
  }
  reportedUnavailable.add(key);
  context.report({
    loc: { line: 1, column: 0 },
    messageId: "unavailable",
    data: { error },
  });
}

/** A line that carries no logic of its own: blank, a comment, or part of an import or export-from statement. */
function isDeclarationLine(line, inBlockComment) {
  const text = line.trim();
  if (inBlockComment) {
    return { declaration: true, inBlockComment: !text.includes("*/") };
  }
  if (text.startsWith("/*")) {
    return { declaration: true, inBlockComment: !text.includes("*/") };
  }

  return { declaration: carriesNoLogic(text), inBlockComment: false };
}

function carriesNoLogic(text) {
  const isComment = text.startsWith("//") || text.startsWith("*");

  return (
    text === "" ||
    isComment ||
    IMPORT_LINE.test(text) ||
    CONTINUATION_LINE.test(text)
  );
}

/**
 * True when the clone carries almost no logic of its own: two modules
 * importing the same things is what sharing a library looks like, and the
 * only way to stop jscpd matching it is a barrel that hides where each
 * symbol comes from, which is a worse file to read. A match runs on past the
 * last import into whatever follows, so a couple of trailing lines are the
 * spillover rather than the duplication.
 */
function isDependencyList(sourceCode, clone) {
  const lines = sourceCode.lines.slice(clone.start.line - 1, clone.end.line);
  let inBlockComment = false;
  let codeLines = 0;

  for (const line of lines) {
    const verdict = isDeclarationLine(line, inBlockComment);

    inBlockComment = verdict.inBlockComment;
    codeLines += verdict.declaration ? 0 : 1;
  }

  return codeLines < MIN_CODE_LINES;
}

function reportClone(context, cwd, clone) {
  context.report({
    loc: { start: clone.start, end: clone.end },
    messageId: "duplicate",
    data: {
      lines: String(clone.lines),
      tokens: String(clone.tokens),
      twin: relative(cwd, clone.twin.file),
      twinStart: String(clone.twin.startLine),
      twinEnd: String(clone.twin.endLine),
    },
  });
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow code blocks that jscpd reports as duplicated elsewhere in the scanned roots",
    },
    schema: [
      {
        type: "object",
        properties: {
          minTokens: { type: "integer", minimum: 1 },
          minLines: { type: "integer", minimum: 1 },
          mode: { enum: ["mild", "weak", "strict"] },
          ignore: { type: "array", items: { type: "string" } },
          roots: { type: "array", items: { type: "string" }, minItems: 1 },
          formats: { type: "array", items: { type: "string" } },
          jscpdBin: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      duplicate:
        "{{lines}} lines ({{tokens}} tokens) duplicated with {{twin}}:{{twinStart}}-{{twinEnd}}",
      unavailable:
        "jscpd could not run ({{error}}) — install it with `npm i -D jscpd` or point the `jscpdBin` option at its run-jscpd.js",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const cwd = context.cwd;
    const filename = resolve(cwd, context.filename);

    return {
      Program() {
        const { key, entry } = scanFor(cwd, options, filename);
        if (entry.error) {
          reportUnavailable(context, key, entry.error);
          return;
        }

        const { sourceCode } = context;

        for (const clone of entry.byFile.get(filename) ?? []) {
          if (!isDependencyList(sourceCode, clone)) {
            reportClone(context, cwd, clone);
          }
        }
      },
    };
  },
};
