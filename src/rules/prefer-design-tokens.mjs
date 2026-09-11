/**
 * prefer-design-tokens — a stylesheet reaches for the design scale through
 * `var(--…)`, not by writing the raw value again.
 *
 * Bootstrap keeps its look consistent by routing every visual decision through
 * a named scale: `$spacers`, `$font-sizes`, `$font-weight-*`, `$line-height-*`,
 * `$border-radius-*`, `$box-shadow-*`, `$zindex-*`, the theme colors. A `13px`
 * margin or a `#333` text color bypasses the scale, so a component drifts from
 * its neighbours and a theme change misses it. Each governed property belongs
 * to one of those groups, and a raw literal in it is reported.
 *
 * What passes: custom property definitions (the token file is where the raw
 * values live), anything inside `var()` including its fallback, `0`,
 * keywords (`auto`, `inherit`, `transparent`, `currentColor`, `bold`),
 * percentages, and a color function built from tokens. `@font-face` is not a
 * style rule, so the family name it defines is not a font choice.
 *
 * Runs under `language: "css/css"` from `@eslint/css`. With
 * `languageOptions.tolerant` it also reads SCSS nesting; a value the parser
 * keeps as raw text, such as `$gap`, is skipped because it cannot be read.
 */

const COLOR_KEYWORDS = new Set(["transparent", "currentcolor"]);

const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);

const TOKEN_FUNCTIONS = new Set(["var", "env"]);

function isTokenReference(node) {
  return (
    node.type === "Function" && TOKEN_FUNCTIONS.has(node.name.toLowerCase())
  );
}

function containsTokenReference(node) {
  return (node.children ?? []).some(
    (child) => isTokenReference(child) || containsTokenReference(child),
  );
}

function isNonZero(node) {
  return Number(node.value) !== 0;
}

function isLength(node) {
  return node.type === "Dimension" && isNonZero(node);
}

function isNumeric(node) {
  return (
    (node.type === "Number" || node.type === "Dimension") && isNonZero(node)
  );
}

const COLOR_SHAPES = {
  Hash: () => true,
  Function: (node) =>
    COLOR_FUNCTIONS.has(node.name.toLowerCase()) &&
    !containsTokenReference(node),
  Identifier: (node, lexer) =>
    !COLOR_KEYWORDS.has(node.name.toLowerCase()) &&
    lexer.matchType("color", node).matched,
};

function isColor(node, lexer) {
  const shape = COLOR_SHAPES[node.type];

  return shape ? shape(node, lexer) : false;
}

function isLengthOrColor(node, lexer) {
  return isLength(node) || isColor(node, lexer);
}

const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

function isFontName(node) {
  return (
    node.type === "String" ||
    (node.type === "Identifier" &&
      !CSS_WIDE_KEYWORDS.has(node.name.toLowerCase()))
  );
}

/** First match wins, so `border-radius` is a radius and never a border color. */
const GROUPS = [
  { name: "radius", property: /radius$/, isRaw: isLength },
  { name: "shadow", property: /shadow$/, isRaw: isLengthOrColor },
  {
    name: "color",
    property:
      /^(color|fill|stroke|caret-color|accent-color|background(-color)?|(border|outline|column-rule|text-decoration)(-[a-z]+)*)$/,
    isRaw: isColor,
  },
  {
    name: "spacing",
    property: /^((margin|padding)(-[a-z]+)*|(row-|column-)?gap)$/,
    isRaw: isLength,
  },
  { name: "font-size", property: /^font-size$/, isRaw: isLength },
  { name: "font-weight", property: /^font-weight$/, isRaw: isNumeric },
  { name: "line-height", property: /^line-height$/, isRaw: isNumeric },
  { name: "z-index", property: /^z-index$/, isRaw: isNumeric },
  { name: "font-family", property: /^font-family$/, isRaw: isFontName },
];

const GROUP_NAMES = GROUPS.map((group) => group.name);

function* literalsOf(node) {
  for (const child of node.children ?? []) {
    if (isTokenReference(child)) continue;
    yield child;
    yield* literalsOf(child);
  }
}

function firstRawLiteral(declaration, group, { sourceCode, allowed }) {
  for (const literal of literalsOf(declaration.value)) {
    const isAllowed = allowed.has(sourceCode.getText(literal));

    if (!isAllowed && group.isRaw(literal, sourceCode.lexer)) {
      return literal;
    }
  }

  return undefined;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "stylesheet colors, spacing, type, radii, shadows and z-indexes come from design tokens",
    },
    schema: [
      {
        type: "object",
        properties: {
          groups: {
            type: "array",
            items: { enum: GROUP_NAMES },
            uniqueItems: true,
          },
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawValue:
        "`{{property}}` uses the raw {{group}} value `{{literal}}`. Reference a design token (`var(--…)`) so every component draws from one scale and a theme can change it in one place.",
    },
  },

  create(context) {
    const { groups = GROUP_NAMES, allow = [] } = context.options[0] ?? {};
    const governed = GROUPS.filter((group) => groups.includes(group.name));
    const { sourceCode } = context;
    const lintScope = { sourceCode, allowed: new Set(allow) };

    return {
      "Rule Declaration"(declaration) {
        const property = declaration.property.toLowerCase();
        const group = GROUPS.find((candidate) =>
          candidate.property.test(property),
        );

        if (!group || !governed.includes(group)) return;
        const literal = firstRawLiteral(declaration, group, lintScope);

        if (!literal) return;
        context.report({
          loc: literal.loc,
          messageId: "rawValue",
          data: {
            property,
            group: group.name,
            literal: sourceCode.getText(literal),
          },
        });
      },
    };
  },
};
