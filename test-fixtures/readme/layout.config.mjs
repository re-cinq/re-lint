import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["apps/web-ui/src/**/*.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-inline-styles": "error",
      "re-lint/no-prop-mutation": "error",
      "re-lint/no-sql-in-web-ui": "error",
      "re-lint/default-export-matches-filename": "error",
      "re-lint/no-io-in-view": [
        "error",
        { dataModules: ["@/lib/db", "@/lib/github"] },
      ],
    },
  },
  {
    files: ["apps/floor/src/**/*.ts"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-forbidden-imports": [
        "error",
        {
          forbidden: [
            {
              specifier: "@google-cloud/storage",
              message: "Reach storage through the shared port adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-row-types-outside-models": [
        "error",
        { modelsDir: "libs/shared/src/models", exemptNames: ["PipelineTask"] },
      ],
      "re-lint/prefer-enforce-true": [
        "error",
        {
          enforceModule: {
            specifier: "@re-cinq/lore-shared/lib/enforce.js",
            sourceDir: "libs/shared/src",
          },
        },
      ],
      "re-lint/test-imports-its-subject": [
        "error",
        { firstPartyScopes: ["@re-cinq"] },
      ],
      "re-lint/no-cross-layer-import": [
        "error",
        { firstPartyScopes: ["@re-cinq"] },
      ],
    },
  },
  {
    files: ["apps/lore-api/src/**/*.ts", "apps/floor/src/**/*.ts"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/prefer-api-error": [
        "error",
        {
          enforceModule: { specifier: "@re-cinq/lore-shared/lib/enforce.js" },
          errorModules: [
            { root: "apps/lore-api/src", path: "server/api-error.js" },
            { root: "apps/floor/src", path: "delivery/http/api-error.js" },
          ],
        },
      ],
    },
  },
];
