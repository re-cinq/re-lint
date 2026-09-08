/**
 * error-shape — decompose a thrown-error expression into the canonical
 * `enforceTrue(cond, ErrorType, message)` argument pair. Returns
 * `{ typeText, messageText }` when the expression is one of the shapes the
 * 3-arg signature can express, `null` otherwise (multi-arg constructors,
 * pre-built error values, computed callees — those need a hand-written
 * `(message) => …` factory or should stay as an if-throw).
 */

const CONSTRUCTION_TYPES = new Set(["NewExpression", "CallExpression"]);

/** Is `callee` a plain name — an Identifier or a non-computed member chain? */
function isPlainCallee(callee) {
  if (callee.type === "Identifier") return true;
  if (callee.type === "MemberExpression" && !callee.computed) {
    return isPlainCallee(callee.object);
  }
  return callee.type === "ThisExpression";
}

// Bare message: enforceTrue wraps it in Error itself.
function isBareMessage(node) {
  if (node.type === "TemplateLiteral") return true;
  return node.type === "Literal" && typeof node.value === "string";
}

// Legacy laziness thunk `() => <error expr>` — unwrap to its body.
function isErrorThunk(node) {
  return (
    node.type === "ArrowFunctionExpression" &&
    node.params.length === 0 &&
    node.body.type !== "BlockStatement"
  );
}

function hasSinglePlainArgument(node) {
  return (
    node.arguments.length === 1 && node.arguments[0].type !== "SpreadElement"
  );
}

// `new X(msg)` / `factory(msg)` with exactly one non-spread argument.
function isPlainSingleArgumentConstruction(node) {
  return (
    CONSTRUCTION_TYPES.has(node.type) &&
    hasSinglePlainArgument(node) &&
    isPlainCallee(node.callee)
  );
}

export function decomposeErrorExpression(node, sourceCode) {
  if (isBareMessage(node)) {
    return { typeText: "Error", messageText: sourceCode.getText(node) };
  }
  if (isErrorThunk(node))
    return decomposeErrorExpression(node.body, sourceCode);
  if (!isPlainSingleArgumentConstruction(node)) return null;
  return {
    typeText: sourceCode.getText(node.callee),
    messageText: sourceCode.getText(node.arguments[0]),
  };
}
