import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["{apps,libs}/*/src/**/*.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-duplicate-code": [
        "error",
        {
          roots: ["apps", "libs"],
          formats: ["typescript", "tsx"],
          minTokens: 50,
          ignore: ["**/dist/**", "**/*.d.ts", "**/fixtures/**"],
        },
      ],
    },
  },
];
