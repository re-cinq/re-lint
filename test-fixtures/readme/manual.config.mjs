import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-nested-if": "error",
      "re-lint/no-flag-params": "error",
      "re-lint/max-boolean-operators": ["error", { max: 2 }],
    },
  },
];
