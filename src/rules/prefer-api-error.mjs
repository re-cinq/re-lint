/**
 * prefer-api-error — a hapi route refuses a request with a PRECONDITION, not an
 * if-return. It rewrites
 *
 *   if (!feature) {
 *     return h.response({ error: "feature not found" }).code(404);
 *   }
 *
 * to
 *
 *   enforceTrue(feature, apiError(404), "feature not found");
 *
 * which reads as the guard it is and narrows the checked expression for every
 * line below it — the if-return form leaves `feature` possibly-null forever.
 * Extra keys beside `error` become `apiError`'s data argument, so a refusal that
 * carries more than prose (the run already in flight, the block that fired)
 * keeps carrying it.
 *
 * Only the shapes the helpers can express are reported. Left alone: a success
 * code, a status computed from data (`.code(gate.code)`, `.code(a ? 404 : 409)`),
 * a body that is not the `{ error }` envelope, an unconditional return, `if/else`,
 * a multi-statement consequent, and — the subtle one — a refusal whose body reads
 * a variable the test narrows. `enforceTrue` asserts its condition AFTER the call,
 * so its own arguments are typed unnarrowed; rewriting `if (inFlight) return
 * h.response({ error: "busy", ...ids(inFlight) }).code(409)` would hand
 * `ids()` the un-narrowed type. Those stay as if-returns.
 *
 * Import targets come from two options and resolve per file:
 *
 *   enforceModule: { specifier, sourceDir? }   — where `enforceTrue` comes
 *                                                from (same shape as
 *                                                `prefer-enforce-true`)
 *   errorModules:  [{ root, path }]            — each server that owns an
 *                                                `apiError`; a file under
 *                                                `root` imports `<root>/<path>`
 *                                                by relative path
 *
 * Servers each own their own `apiError` because the helper builds a
 * framework error, and a shared package that must stay lean cannot carry the
 * framework dependency. Without `errorModules` the rule reports nothing. With
 * it, a file under none of the roots (or linted without `enforceModule`) is
 * still reported — the pattern is still wrong — but without a fix, since the
 * helper's location is unknown.
 */

import {
  ENFORCE_MODULE_SCHEMA,
  enforceSourceFor,
  importInjector,
  payloadDependsOnNarrowing,
  positiveConditionText,
  relativeHelperPath,
  soleStatementOf,
} from "./lib/guard-shape.mjs";

/** Where `apiError` lives relative to the file being fixed, or null where none does. */
function apiErrorSourceFor(filename, errorModules) {
  for (const { root, path: target } of errorModules) {
    const relative = relativeHelperPath(filename, root, target);
    if (relative) return relative;
  }
  return null;
}

function isMemberCall(node) {
  return (
    node?.type === "CallExpression" && node.callee.type === "MemberExpression"
  );
}

function calledMethodName(node) {
  if (!isMemberCall(node) || node.callee.computed) return null;
  return node.callee.property.name;
}

/** The single argument of `<receiver>.<methodName>(arg)`, or null for any other call shape. */
function soleArgumentOfMethodCall(node, methodName) {
  if (calledMethodName(node) !== methodName) return null;
  return node.arguments.length === 1 ? node.arguments[0] : null;
}

function isRefusalStatus(status) {
  return (
    status?.type === "Literal" &&
    typeof status.value === "number" &&
    status.value >= 400
  );
}

function isErrorProperty(property) {
  return (
    property.type === "Property" &&
    !property.computed &&
    (property.key.name ?? property.key.value) === "error"
  );
}

/**
 * The `h.response({ … }).code(<4xx|5xx>)` refusal a return statement answers
 * with, decomposed into its message and its extra keys — or null for anything
 * else returning through the same call shape.
 */
function refusalShape(argument) {
  const status = soleArgumentOfMethodCall(argument, "code");
  if (!isRefusalStatus(status)) return null;
  const body = soleArgumentOfMethodCall(argument.callee.object, "response");
  if (body?.type !== "ObjectExpression") return null;
  const message = body.properties.find(isErrorProperty);
  if (!message) return null;
  return {
    status: status.value,
    message: message.value,
    extras: body.properties.filter((property) => property !== message),
  };
}

/**
 * The refusal an if-return guard answers with, when rewriting it is safe —
 * null for `if/else`, a non-refusal consequent, and a body whose narrowing the
 * rewrite would strip.
 */
function rewritableRefusal(node) {
  if (node.alternate) return null;
  const returnStatement = soleStatementOf(node.consequent, "ReturnStatement");
  if (!returnStatement) return null;
  const refusal = refusalShape(returnStatement.argument);
  if (!refusal) return null;
  if (payloadDependsOnNarrowing(node.test, returnStatement.argument)) {
    return null;
  }
  return refusal;
}

function apiErrorExtrasText(extras, sourceCode) {
  if (!extras.length) return "";
  const entries = extras.map((property) => sourceCode.getText(property));
  return `, { ${entries.join(", ")} }`;
}

function enforceCallText(node, refusal, sourceCode) {
  const condition = positiveConditionText(node.test, sourceCode);
  const extras = apiErrorExtrasText(refusal.extras, sourceCode);
  const message = sourceCode.getText(refusal.message);
  return `enforceTrue(${condition}, apiError(${refusal.status}${extras}), ${message});`;
}

/**
 * The fix factory for one file: `(node, call) => fix`, or a factory answering
 * null when either helper's location is unknown for this file.
 */
function refusalFixFactory(context, enforceModule, errorModules) {
  const apiErrorSource = apiErrorSourceFor(context.filename, errorModules);
  if (!apiErrorSource || !enforceModule) return () => null;
  const ast = context.sourceCode.ast;
  const enforceImport = importInjector(
    ast,
    enforceSourceFor(context.filename, enforceModule),
    (value) => value.endsWith("enforce.js"),
  );
  const apiErrorImport = importInjector(ast, apiErrorSource, (value) =>
    value.endsWith("api-error.js"),
  );
  return (node, call) => (fixer) => [
    fixer.replaceText(node, call),
    ...enforceImport(fixer, "enforceTrue"),
    ...apiErrorImport(fixer, "apiError"),
  ];
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "prefer enforceTrue(cond, apiError(status), message) over an if-return that answers h.response({ error }).code(4xx)",
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          enforceModule: ENFORCE_MODULE_SCHEMA,
          errorModules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                root: { type: "string" },
                path: { type: "string" },
              },
              required: ["root", "path"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferApiError:
        "Prefer enforceTrue(cond, apiError({{status}}), message) over an if-return refusal — it reads as a precondition and narrows the checked expression.",
    },
  },

  create(context) {
    const { enforceModule, errorModules } = context.options[0] ?? {};
    if (!errorModules) return {};

    const sourceCode = context.sourceCode;
    const fixFor = refusalFixFactory(context, enforceModule, errorModules);

    return {
      IfStatement(node) {
        const refusal = rewritableRefusal(node);
        if (!refusal) return;
        context.report({
          node,
          messageId: "preferApiError",
          data: { status: String(refusal.status) },
          fix: fixFor(node, enforceCallText(node, refusal, sourceCode)),
        });
      },
    };
  },
};
