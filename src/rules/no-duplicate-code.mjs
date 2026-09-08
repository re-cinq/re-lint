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
 */

import { statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { resolveJscpdBin, runJscpd } from "./lib/jscpd/runner.mjs";

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

        for (const clone of entry.byFile.get(filename) ?? []) {
          reportClone(context, cwd, clone);
        }
      },
    };
  },
};
