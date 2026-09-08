/**
 * Spawns the jscpd v5 CLI (a bin-only package wrapping a native binary — there
 * is no Node API) and turns its JSON report into the per-file clone index.
 * Never throws: a missing binary or a missing report comes back as
 * `{ error }` so the rule can report it instead of crashing the lint run.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { indexClones } from "./report.mjs";

const REPORT_FILE = "jscpd-report.json";
const MAX_BUFFER = 64 * 1024 * 1024;

function resolveFromDir(dir) {
  try {
    const require = createRequire(join(dir, "package.json"));
    const manifestPath = require.resolve("jscpd/package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return resolve(dirname(manifestPath), manifest.bin.jscpd);
  } catch {
    return null;
  }
}

function* ancestors(dir) {
  let current = resolve(dir);
  while (true) {
    yield current;
    const parent = dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

/**
 * Walks up from `cwd` so a package inside a monorepo finds the jscpd hoisted
 * to the workspace root; `override` short-circuits the search.
 */
export function resolveJscpdBin(cwd, override) {
  if (override) {
    return resolve(cwd, override);
  }

  for (const dir of ancestors(cwd)) {
    const bin = resolveFromDir(dir);
    if (bin) {
      return bin;
    }
  }

  return null;
}

function flag(name, value) {
  return value === undefined ? [] : [name, String(value)];
}

function buildArgs({ bin, output, roots, minTokens, minLines, mode, ignore }) {
  return [
    bin,
    "--reporters",
    "json",
    "--output",
    output,
    "--absolute",
    "--silent",
    ...flag("--min-tokens", minTokens),
    ...flag("--min-lines", minLines),
    ...flag("--mode", mode),
    ...flag("--ignore", ignore?.length ? ignore.join(",") : undefined),
    ...roots,
  ];
}

function readReport(output) {
  const reportPath = join(output, REPORT_FILE);
  if (!existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

export function runJscpd({
  cwd,
  bin,
  roots,
  minTokens,
  minLines,
  mode,
  ignore,
}) {
  if (!bin || !existsSync(bin)) {
    return { error: `jscpd binary not found${bin ? ` at ${bin}` : ""}` };
  }

  const output = mkdtempSync(join(tmpdir(), "re-lint-jscpd-"));
  const startedAt = Date.now();

  try {
    const args = buildArgs({
      bin,
      output,
      roots,
      minTokens,
      minLines,
      mode,
      ignore,
    });
    const result = spawnSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    const report = readReport(output);
    if (!report) {
      const detail = result.error?.message ?? result.stderr ?? "";
      return {
        error:
          `jscpd produced no report (exit ${result.status}): ${detail}`.trim(),
      };
    }
    return { startedAt, byFile: indexClones(report) };
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}
