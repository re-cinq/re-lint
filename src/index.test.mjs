import { test } from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import markdown from "@eslint/markdown";
import plugin, { OPT_IN_RULES } from "./index.mjs";

const presetRuleNames = (configs) =>
  configs.flatMap((config) =>
    Object.keys(config.rules).filter((id) => id.startsWith("re-lint/")),
  );

test("every rule is in the recommended preset or listed as opt-in", () => {
  const inPreset = new Set(
    presetRuleNames(plugin.configs.recommended()).map((id) =>
      id.replace("re-lint/", ""),
    ),
  );
  const unplaced = Object.keys(plugin.rules).filter(
    (name) => !inPreset.has(name) && !OPT_IN_RULES.includes(name),
  );

  assert.deepEqual(unplaced, []);
});

test("recommended() without plugins registers only re-lint", () => {
  const [source] = plugin.configs.recommended();

  assert.deepEqual(Object.keys(source.plugins), ["re-lint"]);
});

test("recommended({ tseslint, stylistic }) adds their rules and plugins", () => {
  const [source] = plugin.configs.recommended({ tseslint, stylistic });

  assert.deepEqual(Object.keys(source.plugins), [
    "re-lint",
    "@typescript-eslint",
    "@stylistic",
  ]);
  assert.equal(
    source.rules["@typescript-eslint/naming-convention"][0],
    "error",
  );
  assert.equal(
    source.rules["@stylistic/padding-line-between-statements"][0],
    "error",
  );
});

test("the preset lints a TypeScript file without configuration errors", async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [...plugin.configs.recommended({ tseslint, stylistic })],
  });
  const [result] = await eslint.lintText(
    "export function total(items: number[]): number {\n  return items.reduce((sum, item) => sum + item, 0);\n}\n",
    { filePath: "src/total.ts" },
  );

  assert.deepEqual(
    result.messages.filter((message) => message.fatal),
    [],
  );
});

test("specs({ markdown }) wires the five document rules over specs and ADRs, the anchor rule over spec markdown and require-spec-link over tests", () => {
  const [documents, links, anchors, tests] = plugin.configs.specs({ markdown });

  assert.deepEqual(
    [documents, links, anchors, tests].map(
      ({ files, language, plugins, rules }) => ({
        files,
        language,
        plugins: Object.keys(plugins),
        rules,
      }),
    ),
    [
      {
        files: ["specs/**/spec.md", "adrs/**/*.md"],
        language: "markdown/gfm",
        plugins: ["markdown", "re-lint"],
        rules: {
          "re-lint/require-intro-paragraph": "error",
          "re-lint/require-statement-links": "warn",
          "re-lint/require-status-matches-coverage": "error",
          "re-lint/no-ungrounded-spec-name": "warn",
        },
      },
      {
        files: ["**/*.md"],
        language: "markdown/gfm",
        plugins: ["markdown", "re-lint"],
        rules: { "re-lint/no-dead-md-links": "error" },
      },
      {
        files: ["specs/**/*.md", "adrs/**/*.md", ".specify/spec.md"],
        language: "markdown/gfm",
        plugins: ["markdown", "re-lint"],
        rules: { "re-lint/no-stale-spec-links": "error" },
      },
      {
        files: ["**/*.{test,spec}.{ts,tsx,mts,js,jsx,mjs}"],
        language: undefined,
        plugins: ["re-lint"],
        rules: { "re-lint/require-spec-link": "error" },
      },
    ],
  );
});

test("specs() without @eslint/markdown throws naming the missing plugin", () => {
  assert.throws(
    () => plugin.configs.specs(),
    /specs\(\{ markdown \}\) needs @eslint\/markdown/,
  );
});

test("the specs preset runs all three document rules on a Shipped spec with one unlinked requirement", async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [...plugin.configs.specs({ markdown })],
  });
  const spec = [
    "# Tasks",
    "",
    "Every task the platform records.",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Status | Shipped |",
    "",
    "## Functional Requirements",
    "",
    "The system records every task.",
    "",
  ].join("\n");
  const [result] = await eslint.lintText(spec, {
    filePath: "specs/tasks/spec.md",
  });

  assert.deepEqual(
    [...new Set(result.messages.map((message) => message.ruleId))].sort(),
    [
      "re-lint/require-intro-paragraph",
      "re-lint/require-statement-links",
      "re-lint/require-status-matches-coverage",
    ],
  );
});
