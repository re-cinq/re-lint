/**
 * no-nested-if — an `if` may not appear inside another `if` within the same
 * function. Nesting conditionals stacks preconditions the reader must hold in
 * their head at once; the house style (see `prefer-early-return`) flattens that
 * into guard clauses or a named predicate.
 *
 * What counts as nesting: any `IfStatement` whose ancestor chain reaches
 * another `IfStatement` before reaching a function boundary. Function
 * boundaries (declarations, expressions, arrows, class static blocks) reset
 * the count — an `if` inside a callback inside an `if` is the callback's
 * business. `else if` chains are exempt: an `IfStatement` that IS its parent's
 * `alternate` sits at the same level as the chain head, not inside it, so the
 * walk continues upward from the head.
 *
 * Autofix, for the one shape that is a pure conjunction: an `if` with no
 * `else` whose whole body is one `if` with no `else`
 * (`if (a) { if (b) work(); }`) becomes `if (a && b) work();`. A comment
 * between the pieces, an `else` on either `if`, or any sibling statement
 * leaves the report unfixed — a guard clause, an extracted predicate, or an
 * extracted function is human judgment, not a codemod.
 */

const FUNCTION_BOUNDARIES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "StaticBlock",
]);

/** `else if`: the child IS its parent's alternate, so it sits at the chain's level. */
function isElseIfChainLink(parent, child) {
  return child.type === "IfStatement" && parent.alternate === child;
}

function enclosingIf(node) {
  let child = node;
  let parent = node.parent;

  while (parent) {
    if (FUNCTION_BOUNDARIES.has(parent.type)) {
      return null;
    }

    if (parent.type === "IfStatement" && !isElseIfChainLink(parent, child)) {
      return parent;
    }

    child = parent;
    parent = parent.parent;
  }

  return null;
}

const LOOSER_THAN_AND = new Set([
  "ConditionalExpression",
  "AssignmentExpression",
  "ArrowFunctionExpression",
  "YieldExpression",
  "SequenceExpression",
]);

function bindsLooserThanAnd(expression) {
  if (expression.type === "LogicalExpression") {
    return expression.operator !== "&&";
  }

  return LOOSER_THAN_AND.has(expression.type);
}

/** The statement standing for `inner` as a body: its own block when that block holds nothing else. */
function bodyHolding(inner) {
  const block = inner.parent;
  const isLoneStatementBlock =
    block.type === "BlockStatement" && block.body.length === 1;

  return isLoneStatementBlock ? block : inner;
}

/** The `if` whose entire body is `inner` (braced or not) and that has no else, or null. */
function mergeableOuter(inner) {
  const body = bodyHolding(inner);
  const outer = body.parent;
  const isBareIf =
    outer.type === "IfStatement" &&
    outer.consequent === body &&
    !outer.alternate;

  return isBareIf && !inner.alternate ? outer : null;
}

function contains(container, node) {
  return (
    node.range[0] >= container.range[0] && node.range[1] <= container.range[1]
  );
}

function keepsEveryComment(sourceCode, outer, inner) {
  const kept = [outer.test, inner.test, inner.consequent];

  return sourceCode
    .getCommentsInside(outer)
    .every((comment) => kept.some((part) => contains(part, comment)));
}

function operandText(sourceCode, operand) {
  const text = sourceCode.getText(operand);

  return bindsLooserThanAnd(operand) ? `(${text})` : text;
}

function mergeFix(sourceCode, inner) {
  const outer = mergeableOuter(inner);

  if (!outer || !keepsEveryComment(sourceCode, outer, inner)) {
    return undefined;
  }

  const condition = `${operandText(sourceCode, outer.test)} && ${operandText(sourceCode, inner.test)}`;

  return (fixer) =>
    fixer.replaceText(
      outer,
      `if (${condition}) ${sourceCode.getText(inner.consequent)}`,
    );
}

export default {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Disallow an if statement nested inside another if statement in the same function (else-if chains excluded)",
    },
    schema: [],
    messages: {
      nestedIf:
        "Nested if — flatten with a guard clause, combine the conditions into a named predicate, or extract a function.",
    },
  },
  create(context) {
    const { sourceCode } = context;

    return {
      IfStatement(node) {
        if (enclosingIf(node)) {
          context.report({
            node,
            messageId: "nestedIf",
            fix: mergeFix(sourceCode, node),
          });
        }
      },
    };
  },
};
