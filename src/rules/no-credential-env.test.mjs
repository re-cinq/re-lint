import { RuleTester } from "eslint";
import rule from "./no-credential-env.mjs";

const ruleTester = new RuleTester();

const FILE = "/repo/apps/web-ui/src/lib/api-client.ts";
const APP_IDENTIFIERS = [
  { names: ["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID"] },
];

ruleTester.run("no-credential-env", rule, {
  valid: [
    // a variable whose name carries no credential word is plain configuration
    {
      code: `const url = process.env.LORE_API_URL;`,
      filename: FILE,
    },
    // a computed key that is not a literal cannot be judged
    {
      code: `const value = process.env[name];`,
      filename: FILE,
    },
    // a rest element names no credential key, so there is nothing to judge
    {
      code: `const { LORE_API_URL, ...others } = process.env;`,
      filename: FILE,
    },
    // a test arranging its environment writes the variable, it does not read it
    {
      code: `process.env.LORE_INGEST_TOKEN = "test-token";`,
      filename: FILE,
    },
    // a test cleaning up its environment deletes the variable, it does not read it
    {
      code: `delete process.env.LORE_INGEST_TOKEN;`,
      filename: FILE,
    },
    // names match exactly: a variable that merely starts the same is not listed
    {
      code: `const slug = process.env.GITHUB_APP_SLUG;`,
      filename: FILE,
      options: APP_IDENTIFIERS,
    },
  ],
  invalid: [
    {
      code: `const token = process.env.LORE_INGEST_TOKEN;`,
      filename: FILE,
      errors: [
        { messageId: "credentialEnv", data: { name: "LORE_INGEST_TOKEN" } },
      ],
    },
    // a string-literal key reads the variable just as the dotted form does
    {
      code: `const key = process.env["GITHUB_APP_PRIVATE_KEY"];`,
      filename: FILE,
      errors: [
        {
          messageId: "credentialEnv",
          data: { name: "GITHUB_APP_PRIVATE_KEY" },
        },
      ],
    },
    // a destructured key names the variable, not its alias; the sibling is harmless
    {
      code: `const { GITHUB_APP_PRIVATE_KEY: privateKey, LORE_API_URL } = process.env;`,
      filename: FILE,
      errors: [
        {
          messageId: "credentialEnv",
          data: { name: "GITHUB_APP_PRIVATE_KEY" },
        },
      ],
    },
    // the right-hand side of a write is still a read
    {
      code: `process.env.COPY = process.env.LORE_INGEST_TOKEN;`,
      filename: FILE,
      errors: [
        { messageId: "credentialEnv", data: { name: "LORE_INGEST_TOKEN" } },
      ],
    },
    // an app id is half a credential, so a listed name counts though the pattern misses it
    {
      code: `const appId = process.env.GITHUB_APP_ID;`,
      filename: FILE,
      options: APP_IDENTIFIERS,
      errors: [{ messageId: "credentialEnv", data: { name: "GITHUB_APP_ID" } }],
    },
  ],
});
