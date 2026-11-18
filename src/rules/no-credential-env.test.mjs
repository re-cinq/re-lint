import { RuleTester } from "eslint";
import rule from "./no-credential-env.mjs";

const ruleTester = new RuleTester();

const FILE = "/repo/apps/web-ui/src/lib/api-client.ts";

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
        { messageId: "credentialEnv", data: { name: "GITHUB_APP_PRIVATE_KEY" } },
      ],
    },
  ],
});
