import { RuleTester } from "eslint";
import rule from "./prefer-api-error.mjs";

const ruleTester = new RuleTester();

const FILE = "/repo/apps/lore-api/src/api/routes/features/features.ts";
const SPECIFIER = "@re-cinq/lore-shared/lib/enforce.js";
const ERROR_MODULES = [
  { root: "apps/lore-api/src", path: "server/api-error.js" },
  { root: "apps/floor/src", path: "delivery/http/api-error.js" },
];
const OPTS = [
  {
    enforceModule: { specifier: SPECIFIER, sourceDir: "libs/shared/src" },
    errorModules: ERROR_MODULES,
  },
];
const ENFORCE = `import { enforceTrue } from "${SPECIFIER}";`;
const API_ERROR = `import { apiError } from "../../../server/api-error.js";`;

/** A guard only parses inside a handler, which is also where every real one lives. */
const handler = (body) => `function handler() { ${body} }`;

const valid = (body) => ({
  code: handler(body),
  filename: FILE,
  options: OPTS,
});

/** Every invalid case runs with both modules configured unless it says otherwise. */
const withOptions = (testCase) => ({ options: OPTS, ...testCase });

const REFUSAL = handler(
  `if (!row) { return h.response({ error: "not found" }).code(404); }`,
);

ruleTester.run("prefer-api-error", rule, {
  valid: [
    // success codes are returns, not refusals
    valid(`if (!x) { return h.response({ error: "no" }).code(200); }`),
    valid(`if (!x) { return h.response({ error: "no" }).code(202); }`),
    // a status computed from data is not a precondition the rule can name
    valid(`if (!x) { return h.response(gate.body).code(gate.code); }`),
    valid(`if (!x) { return h.response({ error: e }).code(bad ? 404 : 409); }`),
    // not the `{ error }` refusal envelope
    valid(`if (!x) { return h.response({ status }).code(503); }`),
    valid(`if (!x) { return h.response(body).code(404); }`),
    // an unconditional return is the handler's answer, not a guard
    valid(`return h.response({ error: "no" }).code(404);`),
    // if/else is a branch; a multi-statement body is not a pure guard
    valid(
      `if (!x) { return h.response({ error: "a" }).code(404); } else { y(); }`,
    ),
    valid(`if (!x) { log(x); return h.response({ error: "a" }).code(404); }`),
    // the refusal reads a variable the test narrows — enforceTrue asserts AFTER
    // the call, so its own arguments would lose that narrowing
    valid(
      `if (inFlight) { return h.response({ error: "busy", ...ids(inFlight) }).code(409); }`,
    ),
    valid(
      `if (!feature) { return h.response({ error: feature.why }).code(404); }`,
    ),
    // `in` narrows too: `result.error` only exists in the branch being deleted
    valid(
      `if ("error" in result) { return h.response({ error: result.error }).code(400); }`,
    ),
    // already the canonical form
    valid(`enforceTrue(feature, apiError(404), "feature not found");`),
    // without `errorModules` no server owns an apiError, so nothing is reported
    { code: REFUSAL, filename: FILE, options: [] },
    {
      code: REFUSAL,
      filename: FILE,
      options: [{ enforceModule: { specifier: SPECIFIER } }],
    },
  ],
  invalid: [
    {
      // negation guard -> positive condition, both imports injected
      code: handler(
        `if (!feature) { return h.response({ error: "feature not found" }).code(404); }`,
      ),
      output: `${ENFORCE}\n${API_ERROR}\n${handler(`enforceTrue(feature, apiError(404), "feature not found");`)}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // a call-expression test narrows nothing, so the message may read the object
      code: `${ENFORCE}\n${API_ERROR}\n${handler(
        "if (!canFinalize(f.status)) { return h.response({ error: `cannot finalize a feature in '${f.status}' state` }).code(409); }",
      )}`,
      output: `${ENFORCE}\n${API_ERROR}\n${handler(
        "enforceTrue(canFinalize(f.status), apiError(409), `cannot finalize a feature in '${f.status}' state`);",
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // single-statement consequent without a block
      code: `${ENFORCE}\n${API_ERROR}\n${handler(
        `if (!pool) return h.response({ error: "database unavailable" }).code(503);`,
      )}`,
      output: `${ENFORCE}\n${API_ERROR}\n${handler(
        `enforceTrue(pool, apiError(503), "database unavailable");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // a comparison guard is flipped, not wrapped in `!( )`
      code: `${ENFORCE}\n${API_ERROR}\n${handler(
        `if (task.repo !== repo) { return h.response({ error: "wrong repo" }).code(403); }`,
      )}`,
      output: `${ENFORCE}\n${API_ERROR}\n${handler(
        `enforceTrue(task.repo === repo, apiError(403), "wrong repo");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // extra keys ride along as apiError's data argument. A positive test is
      // negated as `!( … )` by the shared helper; the repo's `eslint --fix &&
      // prettier` pipeline collapses the redundant parens straight after.
      code: `${ENFORCE}\n${API_ERROR}\n${handler(
        `if (blocked) { return h.response({ error: "blocked", block: name, task_id: id }).code(409); }`,
      )}`,
      output: `${ENFORCE}\n${API_ERROR}\n${handler(
        `enforceTrue(!(blocked), apiError(409, { block: name, task_id: id }), "blocked");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // a spread among the extras survives into the data object
      code: `${ENFORCE}\n${API_ERROR}\n${handler(
        `if (open) { return h.response({ error: "busy", ...ids(other) }).code(409); }`,
      )}`,
      output: `${ENFORCE}\n${API_ERROR}\n${handler(
        `enforceTrue(!(open), apiError(409, { ...ids(other) }), "busy");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // an existing enforce import is extended in place, not duplicated
      code: `import { enforceOk } from "@re-cinq/lore-shared/lib/enforce.js";\n${API_ERROR}\n${handler(
        `if (!row) { return h.response({ error: "not found" }).code(404); }`,
      )}`,
      output: `import { enforceOk, enforceTrue } from "@re-cinq/lore-shared/lib/enforce.js";\n${API_ERROR}\n${handler(
        `enforceTrue(row, apiError(404), "not found");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // the api-error import path is relative to the file being fixed
      code: handler(
        `if (!row) { return h.response({ error: "not found" }).code(404); }`,
      ),
      output: `${ENFORCE}\nimport { apiError } from "./api-error.js";\n${handler(
        `enforceTrue(row, apiError(404), "not found");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: "/repo/apps/lore-api/src/server/thing.ts",
    },
    {
      // the Floor keeps its own helper — it cannot share lore-api's, and shared
      // must not carry @hapi/boom into the lean MCP adapter (ADR-032). Its
      // routes sit one level below it, so the path is relative to the file.
      code: handler(
        `if (!row) { return h.response({ error: "not found" }).code(404); }`,
      ),
      output: `${ENFORCE}\nimport { apiError } from "../api-error.js";\n${handler(
        `enforceTrue(row, apiError(404), "not found");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: "/repo/apps/floor/src/delivery/http/routes/thing.ts",
    },
    {
      // an app with no helper of its own is still reported, just without a fix
      code: REFUSAL,
      output: null,
      errors: [{ messageId: "preferApiError" }],
      filename: "/repo/apps/mcp-server/src/thing.ts",
    },
    {
      // without `enforceModule` the fix cannot name enforceTrue's source, so
      // the report ships without one
      code: REFUSAL,
      options: [{ errorModules: ERROR_MODULES }],
      output: null,
      errors: [{ messageId: "preferApiError" }],
      filename: FILE,
    },
    {
      // a single errorModules entry with its own root and path
      code: REFUSAL,
      options: [
        {
          enforceModule: { specifier: "#enforce.js" },
          errorModules: [
            { root: "services/gateway", path: "errors/api-error.js" },
          ],
        },
      ],
      output: `import { enforceTrue } from "#enforce.js";\nimport { apiError } from "../errors/api-error.js";\n${handler(
        `enforceTrue(row, apiError(404), "not found");`,
      )}`,
      errors: [{ messageId: "preferApiError" }],
      filename: "/repo/services/gateway/routes/thing.ts",
    },
  ].map(withOptions),
});
