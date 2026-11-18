/**
 * no-credential-env — a layer that holds no credential of its own must not read
 * one from the environment. Flags a read of `process.env.NAME`,
 * `process.env["NAME"]` or a destructuring `const { NAME } = process.env` when
 * NAME looks like a credential: it carries TOKEN, SECRET, PASSWORD,
 * PRIVATE_KEY, API_KEY or CREDENTIAL anywhere in the name (case-sensitive).
 *
 * No path gate of its own: the consumer scopes it to the layer in question with
 * a `files:` glob.
 *
 * Detect-only: the fix is reading the credential in the one module that owns
 * it, or asking the service that does.
 */

const CREDENTIAL_NAME = /TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|CREDENTIAL/;

function isProcessEnv(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "process" &&
    node.property.name === "env"
  );
}

function envNameOf(node) {
  if (!isProcessEnv(node.object)) {
    return null;
  }
  if (!node.computed) {
    return node.property.name;
  }
  if (
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return null;
}

function keyNameOf(property) {
  if (property.type !== "Property") {
    return null;
  }
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  if (
    property.key.type === "Literal" &&
    typeof property.key.value === "string"
  ) {
    return property.key.value;
  }
  return null;
}

function reportIfCredential(context, node, name) {
  if (name !== null && CREDENTIAL_NAME.test(name)) {
    context.report({ node, messageId: "credentialEnv", data: { name } });
  }
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow reading an environment variable whose name looks like a credential",
    },
    schema: [],
    messages: {
      credentialEnv:
        "`{{name}}` is a credential read from the environment: this layer holds none of its own. Read it in the one module that owns it, or ask the service that does.",
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        reportIfCredential(context, node, envNameOf(node));
      },

      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || !node.init) {
          return;
        }
        if (!isProcessEnv(node.init)) {
          return;
        }
        for (const property of node.id.properties) {
          reportIfCredential(context, property, keyNameOf(property));
        }
      },
    };
  },
};
