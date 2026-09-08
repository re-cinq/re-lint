/**
 * callee-below-caller — place functions in the downward direction: a reader
 * meets the caller first and finds the callee below it. A file then reads like
 * a newspaper — headline at the top, detail as you scroll — instead of forcing
 * the reader to hold a pile of helpers in their head before the point arrives.
 *
 * What counts: only top-level `FunctionDeclaration`s (direct `Program` children,
 * including `export function`). For each, the FIRST reference in source order
 * that lives inside another top-level function names its caller; a callee whose
 * declaration sits ABOVE that caller is reported. Exemptions:
 *   - a callee referenced at module level (exports, top-level statements,
 *     class bodies) is an entry point, not a helper, and is never reported;
 *   - mutual recursion (A calls B and B calls A) has no downward order;
 *   - a callee with several callers is judged against its first caller only;
 *   - with `exportedFirst` (default true) exported functions are never
 *     reported — they are the entry points and belong at the top.
 *
 * Detect-only: moving a declaration is a cut-and-paste a human should own.
 */

function declaredFunction(statement) {
  const declaration =
    statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration"
      ? statement.declaration
      : statement;

  if (!declaration || declaration.type !== "FunctionDeclaration") {
    return null;
  }

  if (!declaration.id) {
    return null;
  }

  return { node: declaration, exported: declaration !== statement };
}

function topLevelFunctions(program) {
  const found = new Map();

  for (const statement of program.body) {
    const entry = declaredFunction(statement);
    if (entry) {
      found.set(entry.node.id.name, entry);
    }
  }

  return found;
}

function enclosingTopLevelFunction(identifier, program) {
  let node = identifier;

  while (node.parent && node.parent !== program) {
    node = node.parent;
  }

  const entry = declaredFunction(node);
  return entry ? entry.node.id.name : null;
}

function nameVariable(sourceCode, fn) {
  return sourceCode
    .getDeclaredVariables(fn)
    .find((variable) => variable.name === fn.id.name);
}

/**
 * Every reference to `callee` mapped to the top-level function holding it,
 * sorted by source position. A `null` caller marks a module-level reference.
 */
function callersOf(sourceCode, callee, program) {
  const variable = nameVariable(sourceCode, callee);
  const references = variable ? variable.references : [];

  return references
    .map((reference) => reference.identifier)
    .sort((a, b) => a.range[0] - b.range[0])
    .map((identifier) => enclosingTopLevelFunction(identifier, program))
    .filter((caller) => caller !== callee.id.name);
}

function firstCaller(callers) {
  if (callers.length === 0 || callers.includes(null)) {
    return null;
  }

  return callers[0];
}

function isMutualRecursion(callersByName, callee, caller) {
  return callersByName.get(caller).includes(callee);
}

function reportIfAbove(context, functions, callersByName, callee) {
  const caller = firstCaller(callersByName.get(callee));
  if (!caller || isMutualRecursion(callersByName, callee, caller)) {
    return;
  }

  const calleeNode = functions.get(callee).node;
  const callerNode = functions.get(caller).node;
  if (calleeNode.range[0] < callerNode.range[0]) {
    context.report({
      node: calleeNode.id,
      messageId: "calleeAboveCaller",
      data: { callee, caller },
    });
  }
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a top-level function to be declared below the function that first calls it (callers above callees)",
    },
    schema: [
      {
        type: "object",
        properties: { exportedFirst: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      calleeAboveCaller:
        "'{{callee}}' is declared above its caller '{{caller}}'; move it below",
    },
  },
  create(context) {
    const exportedFirst = context.options[0]?.exportedFirst ?? true;
    const { sourceCode } = context;

    return {
      "Program:exit"(program) {
        const functions = topLevelFunctions(program);
        const callersByName = new Map(
          [...functions].map(([name, entry]) => [
            name,
            callersOf(sourceCode, entry.node, program),
          ]),
        );
        const judged = [...functions]
          .filter(([, entry]) => !(exportedFirst && entry.exported))
          .map(([name]) => name);

        for (const callee of judged) {
          reportIfAbove(context, functions, callersByName, callee);
        }
      },
    };
  },
};
