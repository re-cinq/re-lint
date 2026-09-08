import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-row-types-outside-models.mjs";

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

const PORT = "/repo/libs/shared/src/project/tasks/task-store-port.ts";
const MODEL = "/repo/libs/shared/src/models/pipeline-task.ts";
const ROUTE = "/repo/apps/lore-api/src/api/routes/tasks/task-views.ts";
const MODELS = [{ modelsDir: "libs/shared/src/models" }];

ruleTester.run("no-row-types-outside-models", rule, {
  valid: [
    // the models folder is where a row shape belongs
    {
      code: `export interface PipelineTaskRow { task_id: string; created_at: Date; updated_at: Date; }`,
      filename: MODEL,
      options: MODELS,
    },
    // leading/trailing slashes on the option are tolerated
    {
      code: `export interface PipelineTaskRow { task_id: string; created_at: Date; updated_at: Date; }`,
      filename: MODEL,
      options: [{ modelsDir: "/libs/shared/src/models/" }],
    },
    // a camelCase domain type is not a row restatement
    {
      code: `export interface OpenRunSummary { subjectKey: string | null; createdAt: Date; }`,
      filename: PORT,
    },
    // a narrow projection: too few members to be a table
    {
      code: `export interface JobRunRecord { started_at: Date; }`,
      filename: PORT,
    },
    // a deliberate wire type, exempted by name
    {
      code: `export interface PipelineTask { task_id: string; target_repo: string; created_at: string; }`,
      filename: "/repo/libs/shared/src/types.ts",
      options: [{ exemptNames: ["PipelineTask"] }],
    },
    // a test may flatten columns it does not own
    {
      code: `export interface FactRow { agent_id: string; fact_text: string; valid_to: string; }`,
      filename: "/repo/libs/shared/src/project/memory/memory-lifecycle.test.ts",
    },
    // a UI package aliases the generated schema rather than declaring
    {
      code: `export type JobRunRow = components["schemas"]["JobRun"];`,
      filename: "/repo/apps/web-ui/src/lib/api/activity.ts",
    },
    // a Pick over the generated shape is still an alias, not a declaration
    {
      code: `export type Repo = Pick<components["schemas"]["RepoList"]["repos"][number], "full_name">;`,
      filename: "/repo/apps/web-ui/src/app/HomeView.tsx",
    },
  ],
  invalid: [
    {
      code: `export interface RepoRow { full_name: string; onboarded_at: Date; last_ingested_at: Date | null; }`,
      filename: PORT,
      options: MODELS,
      errors: [{ messageId: "rowTypeOutsideModels" }],
    },
    // with no modelsDir configured, even the models folder is not exempt
    {
      code: `export interface PipelineTaskRow { task_id: string; created_at: Date; updated_at: Date; }`,
      filename: MODEL,
      errors: [{ messageId: "rowTypeOutsideModels" }],
    },
    // a different directory than the configured one is not exempt
    {
      code: `export interface PipelineTaskRow { task_id: string; created_at: Date; updated_at: Date; }`,
      filename: MODEL,
      options: [{ modelsDir: "apps/api/src/models" }],
      errors: [{ messageId: "rowTypeOutsideModels" }],
    },
    // a name outside exemptNames is still reported
    {
      code: `export interface PipelineTask { task_id: string; target_repo: string; created_at: string; }`,
      filename: "/repo/libs/shared/src/types.ts",
      options: [{ exemptNames: ["OtherWireType"] }],
      errors: [{ messageId: "rowTypeOutsideModels" }],
    },
    // a route restating a table rather than deriving it
    {
      code: `interface TaskRow { task_type: string; target_repo: string; created_by: string; }`,
      filename: ROUTE,
      options: MODELS,
      errors: [{ messageId: "rowTypeOutsideModels" }],
    },
    // the same declaration wearing `type` instead of `interface`
    {
      code: `type TaskRow = { task_type: string; target_repo: string; created_by: string; };`,
      filename: ROUTE,
      options: MODELS,
      errors: [{ messageId: "rowTypeOutsideModels" }],
    },
  ],
});
