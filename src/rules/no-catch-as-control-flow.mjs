/**
 * no-catch-as-control-flow — flag a catch clause that swallows the error AND
 * fabricates a return value (returns a call/constructor result). That shape is
 * try/catch used as an if: the error is not handled, it is silently traded for
 * an alternate code path. Wrap only the throwing call in a status-returning
 * probe (`catch { return null; }` — a sentinel fallback is fine), or observe
 * the error (log/rethrow/map it) before returning a response.
 *
 * Detect-only: the fix (a probe function, an error log) needs human judgment.
 *
 * A catch *swallows* when it has no parameter or never references it. A catch
 * *fabricates* when a return statement in its own scope (not a nested
 * function) returns a call, constructor, or awaited-call result — literals,
 * identifiers and object literals are sentinel fallbacks and stay legal.
 */

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

const FABRICATING_TYPES = new Set(["CallExpression", "NewExpression"]);

function isAstNode(value) {
  return Boolean(value) && typeof value.type === "string";
}

function childNodes(node) {
  return Object.keys(node)
    .filter((key) => key !== "parent")
    .flatMap((key) => {
      const value = node[key];
      return Array.isArray(value) ? value : [value];
    })
    .filter(isAstNode);
}

function referencesName(node, name) {
  if (!isAstNode(node)) return false;
  if (node.type === "Identifier") return node.name === name;
  return childNodes(node).some((child) => referencesName(child, name));
}

/** Return statements in the catch's own scope — nested functions excluded. */
function ownReturns(node, acc = []) {
  if (!isAstNode(node)) return acc;
  if (FUNCTION_TYPES.has(node.type)) return acc;
  if (node.type === "ReturnStatement") {
    acc.push(node);
    return acc;
  }
  childNodes(node).forEach((child) => ownReturns(child, acc));
  return acc;
}

function fabricatesValue(returnStatement) {
  let argument = returnStatement.argument;
  if (!argument) return false;
  if (argument.type === "AwaitExpression") argument = argument.argument;
  return FABRICATING_TYPES.has(argument.type);
}

function swallowsError(catchClause) {
  if (!catchClause.param) return true;
  if (catchClause.param.type !== "Identifier") return false;
  return !referencesName(catchClause.body, catchClause.param.name);
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow catch clauses that swallow the error and fabricate a return value (try/catch as control flow)",
    },
    schema: [],
    messages: {
      catchAsControlFlow:
        "This catch swallows the error and fabricates a return value — try/catch as control flow. Wrap only the throwing call in a status-returning probe, or observe the error before mapping it.",
    },
  },

  create(context) {
    return {
      CatchClause(node) {
        if (!swallowsError(node)) return;
        if (!ownReturns(node.body).some(fabricatesValue)) return;
        context.report({ node, messageId: "catchAsControlFlow" });
      },
    };
  },
};
