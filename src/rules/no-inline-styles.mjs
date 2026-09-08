/**
 * No inline `style` props — styling belongs in a stylesheet.
 *
 * In the codebase this was extracted from, 175 of them had accumulated, and the
 * same object recurred constantly (`display:flex; align-items:center; gap:N`
 * appeared dozens of times), so there was no single place to change a spacing
 * decision.
 *
 * Reported at `warn`: a rule that red-lights every PR on day one gets disabled
 * rather than obeyed. Verticals convert one at a time.
 *
 * The rule has no path gate of its own: it runs on whatever files the consumer's
 * `files:` glob scopes it to. Genuinely dynamic renderers (SVG transforms,
 * measured heights) turn the rule off by path in the consumer's eslint config,
 * where the exemption is visible and reviewable, rather than by silent tolerance
 * here.
 *
 * A computed `style={obj}` is reported too — the styling decision is still sitting
 * in the component.
 *
 * The one shape that passes is an object of nothing but CSS custom properties —
 * `style={{ "--pill-color": STATUS_COLOR[status] }}`. That is not a styling
 * decision in the component: the rules still live in the stylesheet (`.status-pill`
 * reads `var(--pill-color)`), and the component only hands it a value from a palette
 * shared with, say, canvas renderers, which cannot use classes at all.
 */

const TYPE_CASTS = new Set(["TSAsExpression", "TSTypeAssertion"]);

/** Unwraps the `as CSSProperties` cast callers need, since `CSSProperties` has
 *  no index signature for `--*` keys — written around the object or around each key. */
function unwrapTypeCast(node) {
  return TYPE_CASTS.has(node?.type) ? unwrapTypeCast(node.expression) : node;
}

function isCustomPropertyText(text) {
  return typeof text === "string" && text.startsWith("--");
}

const CUSTOM_PROPERTY_KEY_SHAPES = {
  Literal: (key) => isCustomPropertyText(key.value),
  TemplateLiteral: (key) =>
    key.expressions.length === 0 &&
    isCustomPropertyText(key.quasis[0]?.value.cooked),
};

/** `"--x"`, `` `--x` ``, and the `["--x" as string]` cast the TS types force. */
function isCustomPropertyKey(node) {
  const key = unwrapTypeCast(node);
  const matchesShape = CUSTOM_PROPERTY_KEY_SHAPES[key?.type];

  return matchesShape ? matchesShape(key) : false;
}

function isCustomPropertyEntry(property) {
  return property.type === "Property" && isCustomPropertyKey(property.key);
}

/** An object literal that sets custom properties and nothing else. */
function customPropertiesOnly(node) {
  const object = unwrapTypeCast(node);

  if (object?.type !== "ObjectExpression" || object.properties.length === 0) {
    return false;
  }

  return object.properties.every(isCustomPropertyEntry);
}

function isStyleAttribute(node) {
  return node.name?.type === "JSXIdentifier" && node.name.name === "style";
}

function isCustomPropertiesValue(value) {
  return (
    value?.type === "JSXExpressionContainer" &&
    customPropertiesOnly(value.expression)
  );
}

function elementName(owner) {
  return owner?.type === "JSXIdentifier" ? owner.name : "element";
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "styling lives in a stylesheet, not in a JSX style prop, so a shared decision has one home",
    },
    schema: [],
    messages: {
      inlineStyle:
        "Inline style on <{{element}}>. Move it to a colocated stylesheet — an inline object cannot be shared, so the same rule ends up copied.",
    },
  },

  create(context) {
    return {
      JSXAttribute(node) {
        if (!isStyleAttribute(node) || isCustomPropertiesValue(node.value)) {
          return;
        }

        context.report({
          node,
          messageId: "inlineStyle",
          data: { element: elementName(node.parent?.name) },
        });
      },
    };
  },
};
