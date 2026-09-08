/**
 * no-hybrid-class — avoid hybrid structures, half object and half data. A
 * class that both exposes mutable fields and carries behaviour invites callers
 * to reach in and poke state the methods assume they own; nobody can tell
 * whether to call it or to edit it. Pick one: a plain data type (fields, no
 * methods) or an object (methods, hidden state).
 *
 * What counts: a `ClassDeclaration` / `ClassExpression` with at least one
 * public mutable field AND at least one method.
 *   - public mutable field: a `PropertyDefinition` that is not `static`,
 *     `readonly`, `declare`, `private` / `protected` (TS accessibility) or a
 *     `#private` name; or a TS constructor parameter property marked `public`
 *     and not `readonly`;
 *   - method: a non-static `MethodDefinition` of kind `method` (constructors,
 *     getters and setters do not count — accessors are how fields get hidden).
 * With `ignoreDecorated` (default true) a class carrying decorators is skipped:
 * ORM entities and framework components are hybrids by contract.
 *
 * Detect-only: which half to keep is a design decision.
 */

const HIDDEN_ACCESS = new Set(["private", "protected"]);

function isPublicMutableField(member) {
  if (member.type !== "PropertyDefinition") {
    return false;
  }

  const hidingMarks = [
    member.static,
    member.readonly,
    member.declare,
    HIDDEN_ACCESS.has(member.accessibility),
    member.key.type === "PrivateIdentifier",
  ];

  return !hidingMarks.some(Boolean);
}

function isPublicParameterProperty(param) {
  return (
    param.type === "TSParameterProperty" &&
    param.accessibility === "public" &&
    !param.readonly
  );
}

function constructorFields(member) {
  const isConstructor =
    member.type === "MethodDefinition" && member.kind === "constructor";

  if (!isConstructor) {
    return 0;
  }

  return member.value.params.filter(isPublicParameterProperty).length;
}

function isMethod(member) {
  return (
    member.type === "MethodDefinition" &&
    member.kind === "method" &&
    !member.static
  );
}

function className(node) {
  if (node.id) {
    return node.id.name;
  }

  const { parent } = node;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }

  return "<anonymous>";
}

function isDecorated(node) {
  return (node.decorators ?? []).length > 0;
}

function isHybrid({ fields, methods }) {
  return fields > 0 && methods > 0;
}

function countMembers(body) {
  return body.reduce(
    (counts, member) => ({
      fields:
        counts.fields +
        (isPublicMutableField(member) ? 1 : 0) +
        constructorFields(member),
      methods: counts.methods + (isMethod(member) ? 1 : 0),
    }),
    { fields: 0, methods: 0 },
  );
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow classes that mix public mutable fields with methods (half data structure, half object)",
    },
    schema: [
      {
        type: "object",
        properties: { ignoreDecorated: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      hybridClass:
        "Class '{{name}}' exposes {{fields}} mutable field(s) and {{methods}} method(s); make it a plain data type or hide its fields",
    },
  },
  create(context) {
    const ignoreDecorated = context.options[0]?.ignoreDecorated ?? true;

    function check(node) {
      if (ignoreDecorated && isDecorated(node)) {
        return;
      }

      const counts = countMembers(node.body.body);
      if (!isHybrid(counts)) {
        return;
      }

      context.report({
        node: node.id ?? node,
        messageId: "hybridClass",
        data: { name: className(node), ...counts },
      });
    }

    return {
      ClassDeclaration: check,
      ClassExpression: check,
    };
  },
};
