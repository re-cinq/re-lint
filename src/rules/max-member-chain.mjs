/**
 * max-member-chain — Law of Demeter. A chain like `a.b.c.d` or `a.b().c.d()`
 * reaches through collaborators the caller has no business knowing; the
 * caller should ask its direct collaborator for what it needs.
 *
 * Depth = number of `MemberExpression` hops from the chain's root. Computed
 * hops (`a[0].b`) and optional hops (`a?.b`) count like any other. Only the
 * OUTERMOST member expression of a chain is reported — an inner one whose
 * parent continues the chain (as the object of another member, or as the
 * callee of a call that is itself continued) is skipped.
 *
 * Exempt:
 *  - the root is `this` / `super`;
 *  - the root is a well-known global (`Math`, `JSON`, `Promise`, `Object`,
 *    `Array`, `Number`, `String`, `Reflect`, `process`, `console`,
 *    `globalThis`, `window`, `document`, `Symbol`, `Date`) or a name listed
 *    in option `allowRoots`;
 *  - every hop after the root is a call (`builder().a().b().c()` fluent
 *    chains return the same kind of thing at each step);
 *  - chains rooted in `import.meta`.
 *
 * Detect-only: the fix is a method on the direct collaborator.
 */

const DEFAULT_MAX = 2;
const CHAIN_TEXT_LIMIT = 60;
const DEFAULT_ALLOWED_ROOTS = new Set([
  "Math",
  "JSON",
  "Promise",
  "Object",
  "Array",
  "Number",
  "String",
  "Reflect",
  "process",
  "console",
  "globalThis",
  "window",
  "document",
  "Symbol",
  "Date",
]);
const EXEMPT_ROOT_TYPES = new Set(["ThisExpression", "Super", "MetaProperty"]);
const TRANSPARENT_WRAPPERS = new Set([
  "ChainExpression",
  "TSNonNullExpression",
]);

function isCalled(node) {
  const parent = node.parent;
  return (
    Boolean(parent) &&
    parent.type === "CallExpression" &&
    parent.callee === node
  );
}

function continuesChain(node) {
  const parent = node.parent;

  if (!parent) {
    return false;
  }

  if (parent.type === "MemberExpression") {
    return parent.object === node;
  }

  const isTransparentWrapper =
    isCalled(node) || TRANSPARENT_WRAPPERS.has(parent.type);

  return isTransparentWrapper && continuesChain(parent);
}

/** The node a call or transparent wrapper is applied to; null for anything else. */
function wrappedOf(node) {
  if (node.type === "CallExpression") {
    return node.callee;
  }

  return TRANSPARENT_WRAPPERS.has(node.type) ? node.expression : null;
}

function unwrapToMember(node) {
  let current = node;

  while (current.type !== "MemberExpression") {
    current = wrappedOf(current);

    if (!current) {
      return null;
    }
  }

  return current;
}

function measureChain(outer) {
  let hops = 0;
  let everyHopCalled = true;
  let current = outer;

  while (current) {
    hops += 1;
    everyHopCalled = everyHopCalled && isCalled(current);
    const inner = unwrapToMember(current.object);

    if (!inner) {
      return { hops, everyHopCalled, root: rootOf(current.object) };
    }

    current = inner;
  }

  return { hops, everyHopCalled, root: null };
}

function rootOf(node) {
  let current = node;

  while (
    current.type === "CallExpression" ||
    current.type === "TSNonNullExpression"
  ) {
    current =
      current.type === "CallExpression" ? current.callee : current.expression;
  }

  return current;
}

function isExemptRoot(root, allowedRoots) {
  if (EXEMPT_ROOT_TYPES.has(root.type)) {
    return true;
  }

  return root.type === "Identifier" && allowedRoots.has(root.name);
}

function reportData(node, hops, max, sourceCode) {
  const text = sourceCode.getText(node);
  const chain =
    text.length > CHAIN_TEXT_LIMIT
      ? `${text.slice(0, CHAIN_TEXT_LIMIT - 3)}...`
      : text;
  return { chain, depth: String(hops), max: String(max) };
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce a maximum member-access chain depth (Law of Demeter); fluent all-call chains, this, and well-known globals are exempt",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: { type: "integer", minimum: 1 },
          allowRoots: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      chainTooDeep:
        "Member chain '{{chain}}' reaches {{depth}} hops deep (max {{max}}); ask the direct collaborator for what you need",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const max = options.max ?? DEFAULT_MAX;
    const allowedRoots = new Set([
      ...DEFAULT_ALLOWED_ROOTS,
      ...(options.allowRoots ?? []),
    ]);
    const sourceCode = context.sourceCode;

    return {
      MemberExpression(node) {
        if (continuesChain(node)) {
          return;
        }

        const { hops, everyHopCalled, root } = measureChain(node);

        if (hops <= max || everyHopCalled || isExemptRoot(root, allowedRoots)) {
          return;
        }

        context.report({
          node,
          messageId: "chainTooDeep",
          data: reportData(node, hops, max, sourceCode),
        });
      },
    };
  },
};
