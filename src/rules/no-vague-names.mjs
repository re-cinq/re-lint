/**
 * no-vague-names — bindings named `data`, `temp`, `obj`, `x` and friends say
 * nothing about what they hold; the reader has to reconstruct the meaning the
 * author already had and threw away. Name it like you mean it: `rows`,
 * `retryBudget`, `settingsPatch`.
 *
 * What is checked: names the AUTHOR chose — variable declarations (including
 * destructuring binding names), function/method parameters, function and class
 * declarations, and class members. Object literal keys, member accesses, and
 * import sources are wire/API shapes the code may not control, so they are
 * NOT checked: `const { data: rows } = res` is the sanctioned way to consume a
 * vague upstream field. The shorthand `const { data } = res` still binds a
 * local `data` and is flagged.
 *
 * Exempt: any binding declared in a classic `for (;;)` init — the one place a
 * single-letter index is idiomatic.
 *
 * Detect-only: the machine can prove the name is vague, only the author knows
 * the real one. Blocklist overridable via options `{ names: [...] }`.
 */

const DEFAULT_VAGUE_NAMES = [
  "data",
  "temp",
  "tmp",
  "stuff",
  "info",
  "obj",
  "item",
  "items",
  "misc",
  "helper",
  "helpers",
  "util",
  "utils",
  "val",
  "x",
  "y",
  "z",
  "foo",
  "bar",
  "baz",
];

function patternPropertyBinding(property) {
  return property.type === "Property" ? property.value : property.argument;
}

/** The sub-patterns a destructuring pattern binds through, by pattern type. */
const PATTERN_CHILDREN = {
  ObjectPattern: (pattern) => pattern.properties.map(patternPropertyBinding),
  ArrayPattern: (pattern) => pattern.elements,
  AssignmentPattern: (pattern) => [pattern.left],
  RestElement: (pattern) => [pattern.argument],
  TSParameterProperty: (pattern) => [pattern.parameter],
};

function collectPatternIdentifiers(pattern, found) {
  if (!pattern) {
    return;
  }

  if (pattern.type === "Identifier") {
    found.push(pattern);

    return;
  }

  const childrenOf = PATTERN_CHILDREN[pattern.type];

  if (!childrenOf) {
    return;
  }

  for (const child of childrenOf(pattern)) {
    collectPatternIdentifiers(child, found);
  }
}

function patternIdentifiers(patterns) {
  const identifiers = [];

  for (const pattern of patterns) {
    collectPatternIdentifiers(pattern, identifiers);
  }

  return identifiers;
}

function isForInitBinding(declarator) {
  const declaration = declarator.parent;

  return (
    declaration?.type === "VariableDeclaration" &&
    declaration.parent?.type === "ForStatement" &&
    declaration.parent.init === declaration
  );
}

function functionIdentifiers(node) {
  const ownName = node.id ? [node.id] : [];

  return [...patternIdentifiers(node.params), ...ownName];
}

function memberKeyIdentifiers(node) {
  return !node.computed && node.key.type === "Identifier" ? [node.key] : [];
}

/** The author-chosen identifiers each declaration node binds. */
const DECLARED_IDENTIFIERS = {
  VariableDeclarator: (node) =>
    isForInitBinding(node) ? [] : patternIdentifiers([node.id]),
  FunctionDeclaration: functionIdentifiers,
  FunctionExpression: functionIdentifiers,
  ArrowFunctionExpression: functionIdentifiers,
  ClassDeclaration: (node) => (node.id ? [node.id] : []),
  MethodDefinition: memberKeyIdentifiers,
  PropertyDefinition: memberKeyIdentifiers,
  CatchClause: (node) => patternIdentifiers(node.param ? [node.param] : []),
};

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow vague binding names (data, temp, obj, x, ...) on declarations the author controls",
    },
    schema: [
      {
        type: "object",
        properties: {
          names: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      vagueName:
        "'{{name}}' says nothing about what it holds — name the content (e.g. rows, retryBudget, settingsPatch).",
    },
  },
  create(context) {
    const vagueNames = new Set(
      context.options[0]?.names ?? DEFAULT_VAGUE_NAMES,
    );

    function reportVague(identifiers) {
      for (const identifier of identifiers.filter((id) =>
        vagueNames.has(id.name),
      )) {
        context.report({
          node: identifier,
          messageId: "vagueName",
          data: { name: identifier.name },
        });
      }
    }

    return Object.fromEntries(
      Object.entries(DECLARED_IDENTIFIERS).map(([nodeType, identifiersOf]) => [
        nodeType,
        (node) => reportVague(identifiersOf(node)),
      ]),
    );
  },
};
