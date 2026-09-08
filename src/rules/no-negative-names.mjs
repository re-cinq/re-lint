/**
 * no-negative-names — a declared name may not encode a negation. `isNotReady`
 * forces every reader to unpick `if (!isNotReady)` in their head; `isReady`
 * negated at the use site says the same thing once.
 *
 * What counts: only DECLARATIONS are checked — variables, function names,
 * parameters, class fields and methods, object literal keys, and TS interface
 * property signatures. A reference to a badly-named import is the other
 * module's problem. A name is negative when it matches one of:
 *   - `(is|has|can|should|was|will)?(Not|No)[A-Z]…`  → `isNotReady`, `hasNoItems`, `NotFound`
 *   - `not[A-Z]…`                                      → `notFound`
 *   - `(disable|disabled|hide|hidden|prevent)[A-Z]…`  → `disableSync`, `hideMenu`
 * `un…`, `skip…`, `omit…`, `exclude…` are deliberately left alone: they name
 * real operations far more often than they name a negated state.
 *
 * The message carries the positive spelling (negation stripped, antonym
 * swapped for the verb prefixes). Detect-only: renaming crosses call sites.
 */

const OPTIONAL_PREFIX = "(is|has|can|should|was|will)?";
const ANTONYMS = {
  disable: "enable",
  disabled: "enabled",
  hide: "show",
  hidden: "visible",
  prevent: "allow",
};
const ANTONYM_PREFIXES = Object.keys(ANTONYMS).join("|");

const NEGATIONS = [
  {
    pattern: new RegExp(`^${OPTIONAL_PREFIX}(Not|No)([A-Z]\\w*)$`),
    positive: ([, prefix, , rest]) => (prefix ? prefix + rest : rest),
  },
  {
    pattern: /^not([A-Z]\w*)$/,
    positive: ([, rest]) => rest.charAt(0).toLowerCase() + rest.slice(1),
  },
  {
    pattern: new RegExp(`^(${ANTONYM_PREFIXES})([A-Z]\\w*)$`),
    positive: ([, verb, rest]) => ANTONYMS[verb] + rest,
  },
];

function positiveNameFor(name) {
  for (const { pattern, positive } of NEGATIONS) {
    const match = pattern.exec(name);
    if (match) {
      return positive(match);
    }
  }
  return null;
}

function paramIdentifier(param) {
  if (param.type === "Identifier") {
    return param;
  }
  if (param.type === "AssignmentPattern") {
    return paramIdentifier(param.left);
  }
  if (param.type === "RestElement") {
    return paramIdentifier(param.argument);
  }
  if (param.type === "TSParameterProperty") {
    return paramIdentifier(param.parameter);
  }
  return null;
}

function keyIdentifier(node) {
  if (node.computed || node.key.type !== "Identifier") {
    return null;
  }
  return node.key;
}

function reportNegativeName(context, allow, identifier) {
  if (!identifier || allow.has(identifier.name)) {
    return;
  }
  const suggestion = positiveNameFor(identifier.name);
  if (!suggestion) {
    return;
  }
  context.report({
    node: identifier,
    messageId: "negativeName",
    data: { name: identifier.name, suggestion },
  });
}

function declarationVisitors(check) {
  function checkFunction(node) {
    check(node.id);
    node.params.forEach((param) => check(paramIdentifier(param)));
  }
  return {
    VariableDeclarator(node) {
      if (node.id.type === "Identifier") {
        check(node.id);
      }
    },
    FunctionDeclaration: checkFunction,
    FunctionExpression: checkFunction,
    ArrowFunctionExpression: checkFunction,
    PropertyDefinition(node) {
      check(keyIdentifier(node));
    },
    MethodDefinition(node) {
      check(keyIdentifier(node));
    },
    Property(node) {
      if (node.parent.type === "ObjectExpression" && !node.shorthand) {
        check(keyIdentifier(node));
      }
    },
    TSPropertySignature(node) {
      check(keyIdentifier(node));
    },
  };
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow negated names (isNotReady, notFound, disableX, hideX, preventX) on declarations; name the positive case and negate at the use site",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      negativeName:
        "'{{name}}' is a negative name; name the positive case ({{suggestion}}) and negate at the use site",
    },
  },
  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);
    return declarationVisitors((identifier) =>
      reportNegativeName(context, allow, identifier),
    );
  },
};
