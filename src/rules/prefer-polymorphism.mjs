/**
 * prefer-polymorphism — a switch or if/else-if chain that dispatches on an
 * object's tag (`node.type`, `this.kind`, `event.type`) is a polymorphic
 * method or lookup table written by hand. Every new variant reopens every
 * such site; putting the behaviour on the variant (or in a table keyed by the
 * tag) closes them.
 *
 * What counts:
 *  - a `SwitchStatement` whose discriminant is a `MemberExpression` with at
 *    least `minCases` non-default cases;
 *  - an if / else-if chain in which at least `minCases` tests compare the
 *    SAME member expression (by source text) to a literal with `===` / `==`.
 *    The chain is counted from its head and reported once, at the head.
 *
 * Dispatch on a bare identifier (`switch (mode)`) is NOT reported: a local
 * enum branch is fine; it is the tag on an object that wants polymorphism.
 * Option `discriminants` narrows the rule to member expressions whose
 * property name is listed (e.g. `["type", "kind"]`); empty means any.
 *
 * Detect-only: the refactor is a design change, not a codemod.
 */

const DEFAULT_MIN_CASES = 3;
const EQUALITY_OPERATORS = new Set(["===", "=="]);

function propertyName(member) {
  if (!member.computed) {
    return member.property.name;
  }

  return member.property.type === "Literal"
    ? String(member.property.value)
    : null;
}

function isDiscriminant(node, discriminants) {
  if (!node || node.type !== "MemberExpression") {
    return false;
  }

  return (
    discriminants.length === 0 || discriminants.includes(propertyName(node))
  );
}

function isChainHead(node) {
  const parent = node.parent;
  return !(
    parent &&
    parent.type === "IfStatement" &&
    parent.alternate === node
  );
}

function chainTests(head) {
  const tests = [];
  let current = head;

  while (current && current.type === "IfStatement") {
    tests.push(current.test);
    current = current.alternate;
  }

  return tests;
}

function comparedMember(test, discriminants) {
  if (
    !test ||
    test.type !== "BinaryExpression" ||
    !EQUALITY_OPERATORS.has(test.operator)
  ) {
    return null;
  }

  const { left, right } = test;

  if (right.type === "Literal" && isDiscriminant(left, discriminants)) {
    return left;
  }

  return left.type === "Literal" && isDiscriminant(right, discriminants)
    ? right
    : null;
}

function dominantDiscriminant(members, sourceCode) {
  const counts = new Map();

  for (const member of members) {
    const text = sourceCode.getText(member);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  let best = { discriminant: null, count: 0 };

  for (const [discriminant, count] of counts) {
    best = count > best.count ? { discriminant, count } : best;
  }

  return best;
}

const NO_DISPATCH = { discriminant: null, count: 0 };

function switchDispatch(node, discriminants, sourceCode) {
  if (!isDiscriminant(node.discriminant, discriminants)) {
    return NO_DISPATCH;
  }

  const count = node.cases.filter(
    (switchCase) => switchCase.test !== null,
  ).length;
  return { discriminant: sourceCode.getText(node.discriminant), count };
}

function ifChainDispatch(node, discriminants, sourceCode) {
  if (!isChainHead(node)) {
    return NO_DISPATCH;
  }

  const members = chainTests(node)
    .map((test) => comparedMember(test, discriminants))
    .filter((member) => member !== null);
  return dominantDiscriminant(members, sourceCode);
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer polymorphism (or a lookup table) to a switch or if/else-if chain that dispatches on an object's tag property",
    },
    schema: [
      {
        type: "object",
        properties: {
          minCases: { type: "integer", minimum: 2 },
          discriminants: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferPolymorphism:
        "{{count}}-way dispatch on '{{discriminant}}'; a lookup table or polymorphic method replaces it",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const minCases = options.minCases ?? DEFAULT_MIN_CASES;
    const discriminants = options.discriminants ?? [];
    const sourceCode = context.sourceCode;

    function reportDispatch(node, { discriminant, count }) {
      if (count < minCases) {
        return;
      }

      context.report({
        node,
        messageId: "preferPolymorphism",
        data: { count: String(count), discriminant },
      });
    }

    return {
      SwitchStatement(node) {
        reportDispatch(node, switchDispatch(node, discriminants, sourceCode));
      },
      IfStatement(node) {
        reportDispatch(node, ifChainDispatch(node, discriminants, sourceCode));
      },
    };
  },
};
