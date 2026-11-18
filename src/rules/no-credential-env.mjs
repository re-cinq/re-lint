/**
 * no-credential-env — a layer that holds no credential of its own must not read
 * one from the environment. Flags a read of `process.env.NAME` or
 * `process.env["NAME"]` when NAME looks like a credential: it carries TOKEN, SECRET, PASSWORD, PRIVATE_KEY, API_KEY or
 * CREDENTIAL anywhere in the name (case-sensitive).
 *
 * No path gate of its own: the consumer scopes it to the layer in question with
 * a `files:` glob.
 *
 * Detect-only: the fix is reading the credential in the one module that owns it,
 * or asking the service that does.
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
        const name = envNameOf(node);
        if (name !== null && CREDENTIAL_NAME.test(name)) {
          context.report({ node, messageId: "credentialEnv", data: { name } });
        }
      },
    };
  },
};
