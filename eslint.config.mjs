import js from "@eslint/js";
import globals from "globals";
import reLint from "./src/index.mjs";

export default [
  { ignores: ["dist/**", "node_modules/**", "test-fixtures/**", "reports/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { globals: { ...globals.node } },
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-nested-if": "error",
      "re-lint/no-nested-loop": "error",
      "re-lint/prefer-early-return": "error",
      "re-lint/max-boolean-operators": ["error", { max: 2 }],
      "re-lint/no-vague-names": "error",
      "re-lint/no-catch-as-control-flow": "error",
      "re-lint/require-colocated-tests": "error",
      "re-lint/no-closing-brace-comments": "error",
      "re-lint/no-commented-out-code": "error",
      "re-lint/no-negative-names": "error",
      "max-params": ["error", { max: 4 }],
      "max-lines-per-function": [
        "error",
        { max: 30, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["error", 6],
    },
  },
  {
    files: ["src/**/*.test.mjs"],
    rules: { "max-lines-per-function": "off", "re-lint/no-vague-names": "off" },
  },
];
