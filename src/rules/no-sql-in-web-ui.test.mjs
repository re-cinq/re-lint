import { RuleTester } from "eslint";
import rule from "./no-sql-in-web-ui.mjs";

const ruleTester = new RuleTester();

const UI_FILE = "/repo/src/app/tasks/[id]/page.tsx";

ruleTester.run("no-sql-in-web-ui", rule, {
  valid: [
    // prose that happens to contain the words — the keywords are not SQL-cased
    {
      code: `const hint = "Select a repo from the list to continue";`,
      filename: UI_FILE,
    },
    // an API path, not a query
    {
      code: "const url = `/api/repos/${owner}/${repo}/tasks`;",
      filename: UI_FILE,
    },
    // SQL keywords embedded in an identifier-shaped constant
    {
      code: `const header = "FROM_ADDRESS";`,
      filename: UI_FILE,
    },
    // paired keywords too far apart to be one statement
    {
      code: "const prose = `SELECT ${'x'.repeat(1)} " + "a".repeat(600) + " FROM here`;",
      filename: UI_FILE,
    },
  ],
  invalid: [
    {
      code: `const rows = await query("SELECT id FROM pipeline.tasks WHERE id = $1");`,
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      // no path gate: any file the consumer scopes the rule to is checked
      code: `const rows = await query("SELECT id FROM pipeline.tasks WHERE id = $1");`,
      filename: "/repo/packages/admin/src/routes/task-by-pr.ts",
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      // template literal, interpolated table name
      code: "const rows = await query(`SELECT * FROM ${schema}.chunks LIMIT 10`);",
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      // multi-line query — SELECT and FROM sit on different lines
      code: "const rows = await query(`\n  SELECT id, status\n  FROM pipeline.tasks\n`);",
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      code: `await query("INSERT INTO lore.repos (owner, name) VALUES ($1, $2)");`,
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      code: `await query("UPDATE pipeline.tasks SET status = $1 WHERE id = $2");`,
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      code: `await query("DELETE FROM lore.repos WHERE id = $1");`,
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      // DDL is a query too
      code: `await query("CREATE TABLE lore.repos (id int)");`,
      filename: UI_FILE,
      errors: [{ messageId: "sqlInWebUi" }],
    },
    {
      // a test asserting on SQL is still SQL living in the UI
      code: `expect(sql).toContain("SELECT id FROM pipeline.tasks");`,
      filename: "/repo/src/lib/chunk-union.test.ts",
      errors: [{ messageId: "sqlInWebUi" }],
    },
  ],
});
