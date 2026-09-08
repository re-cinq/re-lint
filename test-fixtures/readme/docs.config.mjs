import markdown from "@eslint/markdown";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["specs/**/spec.md", "adrs/**/*.md"],
    plugins: { markdown, "re-lint": reLint },
    language: "markdown/gfm",
    rules: {
      "re-lint/require-intro-paragraph": "error",
      "re-lint/require-statement-links": "warn",
      "re-lint/require-status-matches-coverage": "error",
      "re-lint/no-dead-md-links": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/require-spec-link": ["error", { roots: ["specs", "adrs"] }],
    },
  },
];
