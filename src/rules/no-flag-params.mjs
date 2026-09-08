/**
 * no-flag-params — a boolean flag argument splits one function into two
 * behaviours selected at the call site. `render(true)` tells the reader
 * nothing; `renderCompact()` tells them everything. The house style wants one
 * function per behaviour, named for what it does.
 *
 * What counts, on the declaration side: a parameter whose TS annotation is
 * `boolean` (also `boolean | undefined` / `boolean | null`), or whose default
 * value is a `true`/`false` literal. On the call side: a bare `true`/`false`
 * literal passed as an argument to a call or `new` expression.
 *
 * Option `allowNamed` (default true): object-destructured parameters
 * (`{ force }: { force: boolean }`) and object-literal arguments
 * (`save({ force: true })`) are named, so they read at the call site and are
 * not flags. Set it to false to report those too.
 *
 * Detect-only: the fix is a second function, or a discriminated options
 * object — human judgment, not a codemod.
 */

const BOOLEAN_KEYWORD = "TSBooleanKeyword";
const NULLISH_KEYWORDS = new Set(["TSUndefinedKeyword", "TSNullKeyword"]);

function isBooleanTypeNode(typeNode) {
  if (!typeNode) {
    return false;
  }

  if (typeNode.type === BOOLEAN_KEYWORD) {
    return true;
  }

  if (typeNode.type !== "TSUnionType") {
    return false;
  }

  const members = typeNode.types.filter(
    (member) => !NULLISH_KEYWORDS.has(member.type),
  );

  return members.length === 1 && members[0].type === BOOLEAN_KEYWORD;
}

function isBooleanLiteral(node) {
  return node?.type === "Literal" && typeof node.value === "boolean";
}

function unwrapParameter(param) {
  if (param.type === "TSParameterProperty") {
    return param.parameter;
  }

  return param;
}

function isFlagParameter(param) {
  const target = unwrapParameter(param);

  if (target.type === "Identifier") {
    return isBooleanTypeNode(target.typeAnnotation?.typeAnnotation);
  }

  if (target.type !== "AssignmentPattern") {
    return false;
  }

  return (
    isBooleanLiteral(target.right) ||
    isBooleanTypeNode(target.left.typeAnnotation?.typeAnnotation)
  );
}

function destructuredPattern(param) {
  const target = unwrapParameter(param);
  const pattern =
    target.type === "AssignmentPattern" ? target.left : target;

  return pattern.type === "ObjectPattern" ? pattern : null;
}

function typeLiteralFlagNames(pattern) {
  const annotation = pattern.typeAnnotation?.typeAnnotation;

  if (annotation?.type !== "TSTypeLiteral") {
    return [];
  }

  return annotation.members
    .filter((member) => member.type === "TSPropertySignature")
    .filter((member) =>
      isBooleanTypeNode(member.typeAnnotation?.typeAnnotation),
    )
    .map((member) => member.key.name);
}

function defaultedFlagNames(pattern) {
  return pattern.properties
    .filter((property) => property.type === "Property")
    .filter(
      (property) =>
        property.value.type === "AssignmentPattern" &&
        isBooleanLiteral(property.value.right),
    )
    .map((property) => property.key.name);
}

function destructuredFlagNames(pattern) {
  return [
    ...new Set([
      ...typeLiteralFlagNames(pattern),
      ...defaultedFlagNames(pattern),
    ]),
  ];
}

function flagPropertyValue(property) {
  if (property.type !== "Property") {
    return null;
  }

  return isBooleanLiteral(property.value) ? property.value : null;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow boolean flag parameters and boolean literal arguments; split the function into one per behaviour",
    },
    schema: [
      {
        type: "object",
        properties: { allowNamed: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      flagParam:
        "Parameter '{{name}}' is a boolean flag; split the function into two named functions",
      flagArgument:
        "Boolean literal argument selects a behaviour; call a dedicated function instead",
    },
  },
  create(context) {
    const allowNamed = context.options[0]?.allowNamed ?? true;

    function reportDestructured(param, pattern) {
      for (const name of destructuredFlagNames(pattern)) {
        context.report({ node: param, messageId: "flagParam", data: { name } });
      }
    }

    function reportParameter(param) {
      const pattern = destructuredPattern(param);

      if (pattern) {
        return allowNamed ? undefined : reportDestructured(param, pattern);
      }

      if (!isFlagParameter(param)) {
        return;
      }

      const target = unwrapParameter(param);
      const name =
        target.type === "AssignmentPattern" ? target.left.name : target.name;

      context.report({ node: param, messageId: "flagParam", data: { name } });
    }

    function reportObjectArgument(argument) {
      const flagged = argument.properties
        .map(flagPropertyValue)
        .filter((value) => value !== null);

      for (const value of flagged) {
        context.report({ node: value, messageId: "flagArgument" });
      }
    }

    function reportArgument(argument) {
      if (isBooleanLiteral(argument)) {
        context.report({ node: argument, messageId: "flagArgument" });

        return;
      }

      if (allowNamed || argument.type !== "ObjectExpression") {
        return;
      }

      reportObjectArgument(argument);
    }

    function checkFunction(node) {
      node.params.forEach(reportParameter);
    }

    function checkCall(node) {
      node.arguments.forEach(reportArgument);
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      TSDeclareFunction: checkFunction,
      TSEmptyBodyFunctionExpression: checkFunction,
      CallExpression: checkCall,
      NewExpression: checkCall,
    };
  },
};
