#!/usr/bin/env node
// re-lint-reanchor: the git and filesystem shell around #spec/spec-reanchor.js.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import {
  DEFAULT_CORPUS,
  addTallies,
  createReanchorer,
  emptyTally,
  formatReanchorReport,
  parseHunks,
  selectCorpus,
} from "#spec/spec-reanchor.js";

const USAGE =
  "usage: re-lint-reanchor [--check] [--all] [--corpus <glob>]... [base-ref]";
const DEFAULT_BASE_REF = "origin/main";
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;

// An unknown flag or a flag missing its value throws; null tells main to print the usage.
function parseStrict(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        check: { type: "boolean" },
        all: { type: "boolean" },
        corpus: { type: "string", multiple: true },
      },
    });
  } catch {
    return null;
  }
}

function parseCli(argv) {
  const parsed = parseStrict(argv);

  if (parsed === null || parsed.positionals.length > 1) {
    return null;
  }

  return {
    check: parsed.values.check === true,
    all: parsed.values.all === true,
    corpus: parsed.values.corpus ?? DEFAULT_CORPUS,
    baseRef: parsed.positionals[0] ?? DEFAULT_BASE_REF,
  };
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: GIT_OUTPUT_LIMIT,
  });

  return result.status === 0 ? result.stdout : null;
}

// Mid-merge the working tree already holds MERGE_HEAD's side, so the baseline includes it.
function mergeBaseOf(root, baseRef) {
  const mergeHead = git(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    "MERGE_HEAD",
  ])?.trim();
  const heads = mergeHead ? ["HEAD", mergeHead] : ["HEAD"];

  return git(root, ["merge-base", baseRef, ...heads])?.trim() || null;
}

const splitLines = (text) => (text ?? "").split("\n").filter(Boolean);

function workingTreeRepository(root, mergeBase) {
  const changed = new Set([
    ...splitLines(git(root, ["diff", "--name-only", mergeBase])),
    ...splitLines(git(root, ["ls-files", "--others", "--exclude-standard"])),
  ]);
  const files = new Map();
  const hunks = new Map();
  const readWorking = (path) => {
    const full = join(root, path);
    const isFile =
      !path.startsWith("..") && existsSync(full) && statSync(full).isFile();

    return isFile ? readFileSync(full, "utf8") : null;
  };
  const cached = (cache, path, load) => {
    if (!cache.has(path)) {
      cache.set(path, load(path));
    }

    return cache.get(path);
  };

  return {
    workingFile: (path) => cached(files, path, readWorking),
    hunks: (path) =>
      cached(hunks, path, () =>
        parseHunks(git(root, ["diff", "-U0", mergeBase, "--", path]) ?? ""),
      ),
    isChanged: (path) => changed.has(path),
  };
}

function corpusDocs(root, patterns) {
  const listed = splitLines(
    git(root, ["ls-files", "--cached", "--others", "--exclude-standard"]),
  );

  return selectCorpus(listed, patterns).filter((doc) =>
    existsSync(join(root, doc)),
  );
}

function reanchorCorpus(root, options, mergeBase) {
  const reanchor = createReanchorer(
    workingTreeRepository(root, mergeBase),
    options,
  );

  return corpusDocs(root, options.corpus).reduce((tally, docPath) => {
    const source = readFileSync(join(root, docPath), "utf8");
    const baseSource = git(root, ["show", `${mergeBase}:${docPath}`]);
    const result = reanchor({ docPath, source, baseSource });

    if (result.text !== source) {
      writeFileSync(join(root, docPath), result.text);
    }

    return addTallies(tally, result.tally);
  }, emptyTally());
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

function main(argv, root) {
  const options = parseCli(argv);

  if (options === null) {
    return fail(USAGE);
  }
  const baseCommit = `${options.baseRef}^{commit}`;

  if (git(root, ["rev-parse", "--verify", "--quiet", baseCommit]) === null) {
    return fail(`base ref does not resolve to a commit: ${options.baseRef}`);
  }
  const mergeBase = mergeBaseOf(root, options.baseRef);

  if (mergeBase === null) {
    return fail(`no merge base between ${options.baseRef} and HEAD`);
  }
  const report = formatReanchorReport(
    reanchorCorpus(root, options, mergeBase),
    options.check,
  );

  process.stdout.write(report.stdout);
  report.stderr.forEach((line) => process.stderr.write(line));
  process.exitCode = report.exitCode;
}

main(process.argv.slice(2), process.cwd());
