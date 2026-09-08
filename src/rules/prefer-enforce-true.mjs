/**
 * prefer-enforce-true — one rule for the canonical house guard form. It rewrites
 * both an `if (!x) throw ...` guard AND a legacy 2-arg `enforceTrue` call to:
 *
 *   enforceTrue(cond, ErrorType, message)   — plain precondition
 *   enforceOk(result, ErrorType)            — `{ ok, error }` result guard;
 *                                             the `.error` read moves inside
 *                                             the helper where the narrowing
 *                                             is type-legal
 *
 * Autofixable: inverts the test to the positive condition, decomposes the
 * thrown/legacy error expression into (ErrorType, message) via error-shape.mjs,
 * and injects the import when missing (extending an existing enforce import in
 * place). If-throw shapes the helpers can't model stay put: `if/else`,
 * multi-statement bodies, rethrow-in-catch, pre-built error values,
 * multi-argument constructors, and thrown values that read a variable the test
 * narrows (other than the `!r.ok` / `r.error` pair, which is exactly what
 * enforceOk exists for). A legacy 2-arg CALL is always reported — without a fix
 * when non-decomposable (wrap the error in a `(message) => …` factory by hand);
 * this leg is permanent, not just a one-off migration: test files are linted
 * WITHOUT type information, so tsc never sees a legacy-form call that only
 * lives in a test.
 *
 * The import target comes from the `enforceModule` option:
 *
 *   { specifier: "@org/shared/lib/enforce.js", sourceDir?: "libs/shared/src" }
 *
 * `specifier` is what the fix imports from. Inside `sourceDir` (the package
 * that OWNS the helper, where a self-package import would resolve to unbuilt
 * dist) the fix imports `lib/enforce.js` by relative path instead. There is no
 * default: with `enforceModule` absent the rule reports nothing, because a
 * report whose fix cannot name the helper is noise. Packages that cannot
 * import the helper at all turn the rule off in an override.
 */

import { decomposeErrorExpression } from "./lib/error-shape.mjs";
import {
  ENFORCE_MODULE_SCHEMA,
  enforceSourceFor,
  importInjector,
  payloadDependsOnNarrowing,
  positiveConditionText,
  soleStatementOf,
} from "./lib/guard-shape.mjs";

function enclosingCatchParamName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "CatchClause") {
      return current.param?.type === "Identifier" ? current.param.name : null;
    }
  }
  return null;
}

/**
 * Detect the enforceOk shape: `if (!<id>.ok) throw <callee>(<id>.error);`
 * where <callee> is a plain single-argument factory/class. Returns
 * `{ objectName, typeText }` or null.
 */
function enforceOkShape(test, thrown, sourceCode) {
  if (test.type !== "UnaryExpression" || test.operator !== "!") return null;
  const okRead = test.argument;
  if (
    okRead.type !== "MemberExpression" ||
    okRead.computed ||
    okRead.property.name !== "ok" ||
    okRead.object.type !== "Identifier"
  ) {
    return null;
  }
  if (
    (thrown.type !== "CallExpression" && thrown.type !== "NewExpression") ||
    thrown.arguments.length !== 1
  ) {
    return null;
  }
  const errorRead = thrown.arguments[0];
  if (
    errorRead.type !== "MemberExpression" ||
    errorRead.computed ||
    errorRead.property.name !== "error" ||
    errorRead.object.type !== "Identifier" ||
    errorRead.object.name !== okRead.object.name
  ) {
    return null;
  }
  const decomposed = decomposeErrorExpression(thrown, sourceCode);
  if (!decomposed) return null;
  return { objectName: okRead.object.name, typeText: decomposed.typeText };
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "prefer enforceTrue(cond, ErrorType, message) / enforceOk(result, ErrorType) over an `if (!cond) throw` guard",
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: { enforceModule: ENFORCE_MODULE_SCHEMA },
        additionalProperties: false,
      },
    ],
    messages: {
      preferEnforce:
        "Prefer enforceTrue(cond, ErrorType, message) over an if-throw guard — it reads as a precondition and narrows the checked expression.",
      preferEnforceOk:
        "Prefer enforceOk(result, ErrorType) over an if-throw result guard — the `.error` read moves inside the helper where the narrowing is legal.",
      legacySignature:
        "enforceTrue takes (condition, ErrorType, errorMessage) — wrap a multi-argument error in a `(message) => …` factory.",
    },
  },

  create(context) {
    const enforceModule = context.options[0]?.enforceModule;
    if (!enforceModule) return {};

    const sourceCode = context.sourceCode;
    const enforceSource = enforceSourceFor(context.filename, enforceModule);
    const importFixes = importInjector(sourceCode.ast, enforceSource, (value) =>
      value.endsWith("enforce.js"),
    );

    return {
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "enforceTrue" ||
          node.arguments.length !== 2 ||
          node.arguments[1].type === "SpreadElement"
        ) {
          return;
        }

        const decomposed = decomposeErrorExpression(
          node.arguments[1],
          sourceCode,
        );
        context.report({
          node,
          messageId: "legacySignature",
          fix: decomposed
            ? (fixer) =>
                fixer.replaceText(
                  node.arguments[1],
                  `${decomposed.typeText}, ${decomposed.messageText}`,
                )
            : null,
        });
      },

      IfStatement(node) {
        if (node.alternate) return;

        const throwStatement = soleStatementOf(
          node.consequent,
          "ThrowStatement",
        );
        if (!throwStatement || !throwStatement.argument) return;

        // Rethrow of the caught error is control flow, not a guard.
        if (
          throwStatement.argument.type === "Identifier" &&
          throwStatement.argument.name === enclosingCatchParamName(node)
        ) {
          return;
        }

        const okShape = enforceOkShape(
          node.test,
          throwStatement.argument,
          sourceCode,
        );
        if (okShape) {
          context.report({
            node,
            messageId: "preferEnforceOk",
            fix: (fixer) => [
              fixer.replaceText(
                node,
                `enforceOk(${okShape.objectName}, ${okShape.typeText});`,
              ),
              ...importFixes(fixer, "enforceOk"),
            ],
          });
          return;
        }

        // Skip when the thrown value depends on a variable the test narrows —
        // enforceTrue can't preserve that narrowing (see narrowedRoots).
        if (payloadDependsOnNarrowing(node.test, throwStatement.argument)) {
          return;
        }

        // Only the shapes the 3-arg signature can express get rewritten;
        // pre-built errors and multi-arg constructors stay as if-throws.
        const decomposed = decomposeErrorExpression(
          throwStatement.argument,
          sourceCode,
        );
        if (!decomposed) return;

        context.report({
          node,
          messageId: "preferEnforce",
          fix: (fixer) => [
            fixer.replaceText(
              node,
              `enforceTrue(${positiveConditionText(node.test, sourceCode)}, ${decomposed.typeText}, ${decomposed.messageText});`,
            ),
            ...importFixes(fixer, "enforceTrue"),
          ],
        });
      },
    };
  },
};
