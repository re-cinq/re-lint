/**
 * no-forbidden-imports — a layer that reaches infrastructure through port
 * adapters never talks to the infra SDK directly. Flags static imports, dynamic
 * `import()`, and `require()` of any configured specifier, matched exactly or as
 * a `specifier/` subpath prefix (`@google-cloud/storage/build/src/bucket.js` is
 * the same SDK as `@google-cloud/storage`).
 *
 * Option `forbidden` (default `[]`): a list of `{ specifier, message? }`. The
 * report reads the entry's `message` when given, otherwise a generic one naming
 * the specifier. No path gate of its own: the consumer scopes it to the layer in
 * question with a `files:` glob.
 *
 * Detect-only: the fix is moving the code behind a port, not a rewrite.
 */

function findForbidden(value, forbidden) {
  if (typeof value !== "string") {
    return null;
  }

  return (
    forbidden.find(
      ({ specifier }) =>
        value === specifier || value.startsWith(`${specifier}/`),
    ) ?? null
  );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow importing configured module specifiers (and their subpaths) in the files the rule is scoped to",
    },
    schema: [
      {
        type: "object",
        properties: {
          forbidden: {
            description:
              "Module specifiers that may not be imported; a subpath under a specifier counts as the same module",
            type: "array",
            items: {
              type: "object",
              properties: {
                specifier: { type: "string" },
                message: { type: "string" },
              },
              required: ["specifier"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenImport:
        "'{{specifier}}' may not be imported here — reach it through the layer that owns it.",
      forbiddenImportCustom: "{{message}}",
    },
  },

  create(context) {
    const forbidden = context.options?.[0]?.forbidden ?? [];

    function reportIfForbidden(node, value) {
      const entry = findForbidden(value, forbidden);
      if (!entry) return;

      if (entry.message) {
        context.report({
          node,
          messageId: "forbiddenImportCustom",
          data: { message: entry.message },
        });

        return;
      }

      context.report({
        node,
        messageId: "forbiddenImport",
        data: { specifier: entry.specifier },
      });
    }

    return {
      ImportDeclaration(node) {
        reportIfForbidden(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          reportIfForbidden(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal"
        ) {
          reportIfForbidden(node, node.arguments[0].value);
        }
      },
    };
  },
};
