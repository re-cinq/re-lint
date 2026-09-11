import css from "@eslint/css";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["**/*.{css,scss}"],
    plugins: { css, "re-lint": reLint },
    language: "css/css",
    languageOptions: { tolerant: true },
    rules: {
      "re-lint/prefer-design-tokens": ["warn", { allow: ["1px"] }],
    },
  },
];
