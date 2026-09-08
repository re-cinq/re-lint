import { RuleTester } from "eslint";
import rule from "./no-forbidden-imports.mjs";

const ruleTester = new RuleTester();

const FILE = "/repo/apps/floor/src/jobs/agent/agent-events-store.ts";
const STORAGE_SDK = [{ forbidden: [{ specifier: "@google-cloud/storage" }] }];
const WITH_MESSAGE = [
  {
    forbidden: [
      {
        specifier: "@google-cloud/storage",
        message: "Go through the shared archive port instead of the GCS SDK.",
      },
    ],
  },
];

ruleTester.run("no-forbidden-imports", rule, {
  valid: [
    // nothing configured, nothing forbidden
    {
      code: `import { Storage } from "@google-cloud/storage";`,
      filename: FILE,
    },
    // importing the port adapters is the sanctioned path
    {
      code: `import { GcsArchive } from "@re-cinq/lore-shared/project/archive/archive-gcs.js";`,
      filename: FILE,
      options: STORAGE_SDK,
    },
    // a sibling package that merely shares the prefix is not the forbidden SDK
    {
      code: `const { MetricExporter } = await import("@google-cloud/opentelemetry-cloud-monitoring-exporter");`,
      filename: FILE,
      options: STORAGE_SDK,
    },
    {
      code: `import x from "@google-cloud/storage-extra";`,
      filename: FILE,
      options: STORAGE_SDK,
    },
  ],
  invalid: [
    {
      code: `import { Storage } from "@google-cloud/storage";`,
      filename: FILE,
      options: STORAGE_SDK,
      errors: [
        {
          messageId: "forbiddenImport",
          data: { specifier: "@google-cloud/storage" },
        },
      ],
    },
    {
      // subpath imports are the same SDK
      code: `import { Bucket } from "@google-cloud/storage/build/src/bucket.js";`,
      filename: FILE,
      options: STORAGE_SDK,
      errors: [{ messageId: "forbiddenImport" }],
    },
    {
      // dynamic import
      code: `const { Storage } = await import("@google-cloud/storage");`,
      filename: FILE,
      options: STORAGE_SDK,
      errors: [{ messageId: "forbiddenImport" }],
    },
    {
      // require
      code: `const { Storage } = require("@google-cloud/storage");`,
      filename: FILE,
      options: STORAGE_SDK,
      errors: [{ messageId: "forbiddenImport" }],
    },
    {
      // an entry's own message replaces the generic one
      code: `import { Storage } from "@google-cloud/storage";`,
      filename: FILE,
      options: WITH_MESSAGE,
      errors: [
        {
          message: "Go through the shared archive port instead of the GCS SDK.",
        },
      ],
    },
    {
      // several entries, each matched on its own
      code: `import fs from "node:fs"; import { Storage } from "@google-cloud/storage";`,
      filename: FILE,
      options: [
        {
          forbidden: [
            { specifier: "node:fs" },
            { specifier: "@google-cloud/storage" },
          ],
        },
      ],
      errors: [
        { messageId: "forbiddenImport", data: { specifier: "node:fs" } },
        {
          messageId: "forbiddenImport",
          data: { specifier: "@google-cloud/storage" },
        },
      ],
    },
  ],
});
