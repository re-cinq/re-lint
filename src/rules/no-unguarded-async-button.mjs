/**
 * A button that starts a request disables itself until the request settles.
 *
 * A `<button type="submit">` with no `disabled` binding, or a button whose click
 * handler is async and has none, gives a second click nothing to stop it and the
 * person no sign that the first one is in flight. In the codebase this was
 * extracted from, ten buttons had each hand-rolled that pending state before one
 * shared button took the promise and owned it, and one destructive form had no
 * feedback at all.
 *
 * What counts as async work is what the syntax shows: an `async` function written
 * inline, or a handler name that resolves in scope to one (`async function f`,
 * `const f = async () =>`, `useCallback(async () => …)`). A synchronous arrow that
 * calls an async function is not chased; the promise is invisible without types,
 * and this rule is meant to run in a type-blind stack.
 *
 * What counts as a guard is a `disabled` attribute, except the literal
 * `disabled={false}`, which is the absence wearing the key. A spread may carry it,
 * so a spread passes. `aria-disabled` announces a state and stops no click.
 *
 * `components` adds a consumer's own button components to the intrinsic
 * `<button>`; `pendingComponent` and `submitComponent` name the house replacement
 * in the message.
 */

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

function isAsyncFunction(node) {
  return FUNCTION_TYPES.has(node?.type) && node.async;
}

function isUseCallback(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "useCallback"
  );
}

/** `useCallback(async () => …, deps)` hands its function through unchanged. */
function unwrapUseCallback(node) {
  return isUseCallback(node) ? node.arguments[0] : node;
}

function findVariable(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);

    if (variable) {
      return variable;
    }
  }

  return null;
}

/** The function a variable holds: its declaration, or its initialiser. */
function functionHeldBy(variable) {
  const definition = variable?.defs[0];

  if (definition?.type === "FunctionName") {
    return definition.node;
  }

  if (definition?.type === "Variable") {
    return unwrapUseCallback(definition.node.init);
  }

  return null;
}

function resolvesToAsyncFunction(identifier, sourceCode) {
  const scope = sourceCode.getScope(identifier);

  return isAsyncFunction(functionHeldBy(findVariable(scope, identifier.name)));
}

/** The handler is async: written inline, or a name bound to an async function. */
function isAsyncHandler(value, sourceCode) {
  const expression = expressionOf(value);

  if (expression?.type === "Identifier") {
    return resolvesToAsyncFunction(expression, sourceCode);
  }

  return isAsyncFunction(expression);
}

/** What an attribute holds: a bare literal, or what its `{…}` wraps. */
function expressionOf(value) {
  return value?.type === "JSXExpressionContainer" ? value.expression : value;
}

function attributeNamed(node, name) {
  return node.attributes.find(
    (attribute) =>
      attribute.type === "JSXAttribute" && attribute.name.name === name,
  );
}

function hasSpread(node) {
  return node.attributes.some(
    (attribute) => attribute.type === "JSXSpreadAttribute",
  );
}

function literalValue(value) {
  const expression = expressionOf(value);

  return expression?.type === "Literal" ? expression.value : undefined;
}

/** A `disabled` that can ever be true, or a spread that may hold one. */
function isGuarded(node) {
  if (hasSpread(node)) {
    return true;
  }

  const guard = attributeNamed(node, "disabled");

  return guard !== undefined && literalValue(guard.value) !== false;
}

function isSubmit(node) {
  return literalValue(attributeNamed(node, "type")?.value) === "submit";
}

function elementName(node) {
  return node.name.type === "JSXIdentifier" ? node.name.name : null;
}

function violationOf(node, sourceCode) {
  if (isSubmit(node)) {
    return "submitUnguarded";
  }

  const handler = attributeNamed(node, "onClick");

  return isAsyncHandler(handler?.value, sourceCode) ? "asyncUnguarded" : null;
}

const HINT_OPTION = {
  submitUnguarded: "submitComponent",
  asyncUnguarded: "pendingComponent",
};

function hintFor(messageId, options) {
  const component = options[HINT_OPTION[messageId]];

  return component ? ` — or use <${component}>, which owns it` : "";
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "a button that starts a request binds `disabled` to its pending state, so a second click cannot start it again",
    },
    schema: [
      {
        type: "object",
        properties: {
          components: {
            description:
              "Component names checked like the intrinsic <button> (a consumer's own Button)",
            type: "array",
            items: { type: "string" },
          },
          pendingComponent: {
            description:
              "The house component that takes a promise-returning action and owns the pending state; named in the message",
            type: "string",
          },
          submitComponent: {
            description:
              "The house submit button that reads the form's pending state; named in the message",
            type: "string",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      submitUnguarded:
        "<{{element}}> submits the form but never disables itself, so a second click submits it again. Bind `disabled` to the form's pending state{{hint}}.",
      asyncUnguarded:
        "<{{element}}> starts async work on click but never disables itself, so a second click starts it again. Bind `disabled` to the pending state{{hint}}.",
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const buttons = new Set(["button", ...(options.components ?? [])]);

    return {
      JSXOpeningElement(node) {
        const element = elementName(node);

        if (!buttons.has(element) || isGuarded(node)) {
          return;
        }

        const messageId = violationOf(node, context.sourceCode);

        if (!messageId) {
          return;
        }

        context.report({
          node,
          messageId,
          data: { element, hint: hintFor(messageId, options) },
        });
      },
    };
  },
};
