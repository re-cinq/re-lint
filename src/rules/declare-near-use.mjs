/**
 * declare-near-use — declare variables close to their usage. A `const` bound
 * at the top of a block and first read a dozen statements later makes the
 * reader carry it the whole way down; declaring it right above its first use
 * keeps the value and its purpose on the same screen.
 *
 * What counts: a `const` / `let` declaration that is a direct child of a
 * `BlockStatement` or `Program`, whose first reference (init reference
 * excluded) lands in a sibling statement of the same list. When more than
 * `maxDistance` (default 5) statements separate the declaration from that
 * sibling, the declaration is reported. Skipped, because a later position
 * would change meaning or is not obviously better:
 *   - the first reference sits inside a nested block or function (a loop body,
 *     a callback, an `if` arm) — hoisting it into the branch is a judgment call;
 *   - references spread over two or more branching siblings (`if` / `switch` /
 *     `try`) — the declaration is shared state between arms;
 *   - `let` without an initialiser — deliberately declared for later assignment;
 *   - `var`, and exported Program-level declarations (an export is a reference).
 *
 * Detect-only: moving a declaration past side-effecting statements needs a
 * human to confirm nothing observes the old order.
 */

const BLOCK_PARENTS = new Set(["BlockStatement", "Program"]);
const BRANCHING = new Set(["IfStatement", "SwitchStatement", "TryStatement"]);
const NESTING = new Set([
  "BlockStatement",
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassBody",
  "StaticBlock",
]);

function isCandidate(node) {
  if (node.kind === "var" || !BLOCK_PARENTS.has(node.parent.type)) {
    return false;
  }

  return node.declarations.every((declarator) => declarator.init);
}

/**
 * Walks from a reference up to the statement list holding `declaration`,
 * noting whether a nested scope sits between the reference and that sibling.
 */
function locateReference(identifier, declaration) {
  const list = declaration.parent;
  let node = identifier;
  let nested = false;

  while (node.parent && node.parent !== list) {
    node = node.parent;
    nested = nested || NESTING.has(node.type);
  }

  return { statement: node, nested, name: identifier.name };
}

function usageSites(sourceCode, declaration) {
  return sourceCode
    .getDeclaredVariables(declaration)
    .flatMap((variable) => variable.references)
    .filter((reference) => !reference.init)
    .map((reference) => reference.identifier)
    .sort((a, b) => a.range[0] - b.range[0])
    .map((identifier) => locateReference(identifier, declaration))
    .filter((site) => site.statement !== declaration);
}

function spansBranches(sites) {
  const arms = new Set(
    sites
      .map((site) => site.statement)
      .filter((statement) => BRANCHING.has(statement.type)),
  );

  return arms.size >= 2;
}

function statementDistance(declaration, statement) {
  const list = declaration.parent.body;
  return list.indexOf(statement) - list.indexOf(declaration) - 1;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a const/let declaration to sit within a few statements of its first use in the same block",
    },
    schema: [
      {
        type: "object",
        properties: { maxDistance: { type: "integer", minimum: 0 } },
        additionalProperties: false,
      },
    ],
    messages: {
      declaredTooEarly:
        "'{{name}}' is declared {{distance}} statements before its first use (max {{maxDistance}}); move it down",
    },
  },
  create(context) {
    const maxDistance = context.options[0]?.maxDistance ?? 5;
    const { sourceCode } = context;

    return {
      VariableDeclaration(node) {
        if (!isCandidate(node)) {
          return;
        }

        const sites = usageSites(sourceCode, node);
        const [first] = sites;
        if (!first || first.nested || spansBranches(sites)) {
          return;
        }

        const distance = statementDistance(node, first.statement);
        if (distance > maxDistance) {
          context.report({
            node,
            messageId: "declaredTooEarly",
            data: { name: first.name, distance, maxDistance },
          });
        }
      },
    };
  },
};
