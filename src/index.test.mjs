import { test } from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
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
    overrideConfig: [
      { languageOptions: { parser: tseslint.parser } },
      ...plugin.configs.recommended({ tseslint, stylistic }),
    ],
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
