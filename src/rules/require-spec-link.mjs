/**
 * require-spec-link — every `it()`/`test()` must be linked to a spec or ADR.
 *
 * The spec-traceability convention authors the link INSIDE the spec.md/adr `.md`
 * as an inline trailing parenthetical — `Statement. ([validated by](test.ts#L42))`.
 * This rule inverts that view: it goes over each test declaration and fails the
 * ones that no spec or ADR statement references, so tests cannot silently drift
 * out of spec coverage.
 *
 * A test is linked when the spec/adr corpus carries a `([validated by](this#Lnn))`
 * link whose line falls inside the test's line span, or a whole-file link (no
 * `#L`) to the file. A link whose label names a test of the file
 * (`[validated by <title>]`, compared as `re-lint-reanchor` compares it) links
 * that test only, and only when its anchor lands inside it: a stale anchor that
 * drifted into a neighbour is reported on the titled test instead of silently
 * linking the neighbour. A label naming no test of the file keeps the span rule. The corpus is read once per process (memoized per specsRoot)
 * via the shared parser — see `lib/spec-link-index.mjs`. Type info is off for
 * test files, so this works from the ESTree AST + filename + filesystem only.
 *
 * Detect-only: writing the link needs a human to pick which statement the test
 * validates, not a codemod.
 */

import path from "node:path";
import { isTestFile, normalizeTitle } from "./lib/spec-parsers.mjs";
import {
  buildLinkIndex,
  corpusExists,
  readSpecFiles,
  toPosix,
} from "./lib/spec-link-index.mjs";

/**
 * specsRoot+roots → index, so the corpus is walked once per process.
 *
 * Note: the cache is keyed on specsRoot only, with no mtime/content hash — a
 * single-pass `eslint`/CI run always reads fresh, but a long-lived ESLint
 * server (VS Code extension, --watch) will not see a spec link added after the
 * first lint until the server restarts.
 */
const indexCache = new Map();

/** specsRoots we've already warned about having no spec/adr corpus, so a
 * misconfigured run warns once instead of once per linted test file.
 *
 * Scope is the whole Node process, matching `indexCache` above. In a one-shot
 * `eslint`/CI run that is exactly one warning. In a long-lived ESLint server
 * (VS Code, --watch) the module is not re-required between cycles, so once a
 * specsRoot has warned it stays quiet even after the CWD is fixed — the same
 * process-lifetime memoization caveat the corpus cache carries. Restart the
 * server (or the editor) to re-arm the warning. */
const warnedMissingCorpus = new Set();

function getIndex(specsRoot, roots) {
  // `\0` separates every element so no root value can collide with the joiner.
  const key = [specsRoot, ...roots].join("\0");
  let index = indexCache.get(key);

  if (!index) {
    index = buildLinkIndex(readSpecFiles(specsRoot, roots));
    indexCache.set(key, index);
  }

  return index;
}

/** The base identifier of a (possibly chained) callee — `it` in `it.each([])(…)`. */
function rootCallName(callee) {
  let node = callee;

  while (node) {
    if (node.type === "Identifier") {
      return node.name;
    }

    if (node.type === "MemberExpression") {
      node = node.object;

      continue;
    }

    if (node.type === "CallExpression") {
      node = node.callee;

      continue;
    }

    // `it.each`table`(name, fn)` — the outer callee is a tagged template whose
    // `.tag` is the `it.each` member chain; drill into it or the test escapes.
    if (node.type === "TaggedTemplateExpression") {
      node = node.tag;

      continue;
    }

    return null;
  }

  return null;
}

/** A named test declaration: `it`/`test` (any modifier chain) with a string name. */
function isNamedTestCall(node) {
  const root = rootCallName(node.callee);

  if (root !== "it" && root !== "test") {
    return false;
  }
  const first = node.arguments[0];

  if (!first) {
    return false;
  }

  if (first.type === "Literal") {
    return typeof first.value === "string";
  }

  return first.type === "TemplateLiteral";
}

const covers = (test, line) => line >= test.startLine && line <= test.endLine;

/**
 * The tests one anchor links, and the titled tests it misses. A link whose label
 * names a test in this file links that test alone, and only when its anchor
 * lands inside it; any other link reaches the test its anchor lands in.
 */
function reachOf(tests, anchor) {
  const titled = tests.filter((test) => test.title === anchor.title);
  const hits = (titled.length > 0 ? titled : tests).filter((test) =>
    covers(test, anchor.line),
  );

  return { hits, missed: hits.length === 0 ? titled : [] };
}

/** Which tests the file's links reach, and the titled links that miss their test. */
function resolveAnchors(tests, entry) {
  const anchors = entry?.anchors ?? [];
  const reaches = anchors.map((anchor) => ({
    anchor,
    ...reachOf(tests, anchor),
  }));

  return {
    linked: new Set([
      ...(entry?.wholeFile ? tests : []),
      ...reaches.flatMap(({ hits }) => hits),
    ]),
    misanchored: reaches.flatMap(({ anchor, missed }) =>
      missed.map((test) => ({ test, anchor })),
    ),
  };
}

// With no corpus under specsRoot, every test would flag as unlinked — a
// false-positive storm that means the run started outside the repo root
// (e.g. `eslint apps/floor/` in a subdir). Warn once and skip rather than
// report thousands of misleading errors.
function warnMissingCorpusOnce(specsRoot, roots) {
  if (warnedMissingCorpus.has(specsRoot)) {
    return;
  }
  warnedMissingCorpus.add(specsRoot);
  console.warn(
    `require-spec-link: no ${roots.join("/")} directory under ${specsRoot} — ` +
      "run eslint from the repo root (or pass options.specsRoot). Skipping the spec-link check.",
  );
}

function testName(sourceCode, first) {
  return first.type === "Literal"
    ? String(first.value)
    : sourceCode.getText(first);
}

// The title a link label is compared with: a template literal with no
// expressions reads as its value, one with expressions as written.
function testTitle(sourceCode, first) {
  const plain =
    first.type === "TemplateLiteral" && first.expressions.length === 0;

  return normalizeTitle(
    plain ? first.quasis[0].value.cooked : testName(sourceCode, first),
  );
}

function testOf(sourceCode, node) {
  return {
    node,
    name: testName(sourceCode, node.arguments[0]),
    title: testTitle(sourceCode, node.arguments[0]),
    startLine: node.loc.start.line,
    endLine: node.loc.end.line,
  };
}

function reportTests(context, tests, corpus) {
  const { linked, misanchored } = resolveAnchors(tests, corpus.entry);

  for (const { test, anchor } of misanchored) {
    context.report({
      node: test.node.callee,
      messageId: "misanchoredLink",
      data: {
        name: test.name,
        spec: anchor.specPath,
        anchor: String(anchor.line),
        line: String(test.startLine),
      },
    });
  }
  const named = new Set(misanchored.map(({ test }) => test));

  for (const test of tests.filter(
    (test) => !linked.has(test) && !named.has(test),
  )) {
    context.report({
      node: test.node.callee,
      messageId: "unlinkedTest",
      data: {
        name: test.name,
        file: corpus.relPath,
        line: String(test.startLine),
        roots: corpus.roots.map((root) => `${root}/**/*.md`).join(" or "),
      },
    });
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require every test to be linked from a spec or ADR via an inline ([validated by](test.ts#Lline)) link. The spec/adr corpus is read once per process and memoized, so in a long-lived ESLint server (VS Code extension, --watch) a newly added link is not seen until the server restarts; a one-shot `eslint`/CI run always reads fresh.",
    },
    schema: [
      {
        type: "object",
        properties: {
          specsRoot: { type: "string" },
          roots: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unlinkedTest:
        "Test {{name}} has no spec link — add an inline ([validated by]({{file}}#L{{line}})) to the statement it validates in a {{roots}} markdown file (or, if this test isn't tied to a spec statement, it may not belong in the traceable suite).",
      misanchoredLink:
        "Test {{name}} is named by a link in {{spec}} whose anchor #L{{anchor}} lies outside it, so the link counts for no test — repoint it to #L{{line}} (`eslint --fix` with no-stale-spec-links moves an anchor that landed in another test).",
    },
  },

  create(context) {
    // Match the same predicate `buildLinkIndex` uses to keep validated-by links
    // (isTestFile: .test./.spec./__tests__/…), so a linkable test can't escape
    // the rule on a naming variant.
    if (!isTestFile(toPosix(context.filename))) {
      return {};
    }
    const options = context.options[0] ?? {};
    const specsRoot = options.specsRoot ?? context.cwd;
    const roots = options.roots ?? ["specs", "adrs"];

    if (!corpusExists(specsRoot, roots)) {
      warnMissingCorpusOnce(specsRoot, roots);

      return {};
    }

    const relPath = toPosix(path.relative(specsRoot, context.filename));
    const corpus = {
      entry: getIndex(specsRoot, roots).get(relPath),
      relPath,
      roots,
    };

    const tests = [];

    return {
      CallExpression(node) {
        if (isNamedTestCall(node)) {
          tests.push(testOf(context.sourceCode, node));
        }
      },
      "Program:exit": () => reportTests(context, tests, corpus),
    };
  },
};
