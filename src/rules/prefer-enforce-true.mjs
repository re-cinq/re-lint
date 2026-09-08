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
  isNegation,
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

const CONSTRUCTION_TYPES = new Set(["CallExpression", "NewExpression"]);

function isPropertyRead(node, propertyName) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.name === propertyName
  );
}

/** The identifier `<id>` of an `<id>.<propertyName>` read, or null. */
function identifierReadOf(node, propertyName) {
  if (!isPropertyRead(node, propertyName)) return null;
  return node.object.type === "Identifier" ? node.object.name : null;
}

function isSingleArgumentConstruction(node) {
  return CONSTRUCTION_TYPES.has(node.type) && node.arguments.length === 1;
}

/**
 * Detect the enforceOk shape: `if (!<id>.ok) throw <callee>(<id>.error);`
 * where <callee> is a plain single-argument factory/class. Returns
 * `{ objectName, typeText }` or null.
 */
function enforceOkShape(test, thrown, sourceCode) {
  if (!isNegation(test)) return null;
  const objectName = identifierReadOf(test.argument, "ok");
  if (!objectName) return null;
  if (!isSingleArgumentConstruction(thrown)) return null;
  if (identifierReadOf(thrown.arguments[0], "error") !== objectName)
    return null;
  const decomposed = decomposeErrorExpression(thrown, sourceCode);
  return decomposed ? { objectName, typeText: decomposed.typeText } : null;
}

function isEnforceTrueCall(node) {
  return (
    node.callee.type === "Identifier" && node.callee.name === "enforceTrue"
  );
}

function hasTwoPlainArguments(node) {
  return (
    node.arguments.length === 2 && node.arguments[1].type !== "SpreadElement"
  );
}

function legacySignatureFix(decomposed, errorArgument) {
  if (!decomposed) return null;
  return (fixer) =>
    fixer.replaceText(
      errorArgument,
      `${decomposed.typeText}, ${decomposed.messageText}`,
    );
}

function reportLegacyCall(context, node) {
  if (!isEnforceTrueCall(node) || !hasTwoPlainArguments(node)) return;
  const errorArgument = node.arguments[1];
  const decomposed = decomposeErrorExpression(
    errorArgument,
    context.sourceCode,
  );
  context.report({
    node,
    messageId: "legacySignature",
    fix: legacySignatureFix(decomposed, errorArgument),
  });
}

// Rethrow of the caught error is control flow, not a guard.
function isRethrow(thrown, node) {
  return (
    thrown.type === "Identifier" &&
    thrown.name === enclosingCatchParamName(node)
  );
}

/** The expression an `if (…) throw …` guard throws, or null for any other if. */
function guardedThrow(node) {
  if (node.alternate) return null;
  const throwStatement = soleStatementOf(node.consequent, "ThrowStatement");
  const thrown = throwStatement?.argument;
  if (!thrown) return null;
  return isRethrow(thrown, node) ? null : thrown;
}

function enforceOkReport(node, okShape, importFixes) {
  return {
    node,
    messageId: "preferEnforceOk",
    fix: (fixer) => [
      fixer.replaceText(
        node,
        `enforceOk(${okShape.objectName}, ${okShape.typeText});`,
      ),
      ...importFixes(fixer, "enforceOk"),
    ],
  };
}

function enforceTrueReport(node, decomposed, sourceCode, importFixes) {
  const condition = positiveConditionText(node.test, sourceCode);
  return {
    node,
    messageId: "preferEnforce",
    fix: (fixer) => [
      fixer.replaceText(
        node,
        `enforceTrue(${condition}, ${decomposed.typeText}, ${decomposed.messageText});`,
      ),
      ...importFixes(fixer, "enforceTrue"),
    ],
  };
}

/**
 * The report for an if-throw guard, or null when neither helper can model it:
 * a thrown value that reads a variable the test narrows (enforceTrue can't
 * preserve that narrowing, see narrowedRoots), or one that is not
 * decomposable into (ErrorType, message).
 */
function guardReport(node, thrown, sourceCode, importFixes) {
  const okShape = enforceOkShape(node.test, thrown, sourceCode);
  if (okShape) return enforceOkReport(node, okShape, importFixes);
  if (payloadDependsOnNarrowing(node.test, thrown)) return null;
  const decomposed = decomposeErrorExpression(thrown, sourceCode);
  if (!decomposed) return null;
  return enforceTrueReport(node, decomposed, sourceCode, importFixes);
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
        reportLegacyCall(context, node);
      },
      IfStatement(node) {
        const thrown = guardedThrow(node);
        if (!thrown) return;
        const report = guardReport(node, thrown, sourceCode, importFixes);
        if (report) context.report(report);
      },
    };
  },
};
