/**
 * no-weak-assertion — an assertion must check the value, not only its shape.
 * `expect(rows).toHaveLength(2)` passes with the wrong two rows;
 * `toEqual([...])` or `toContainEqual(...)` does not.
 *
 * Inside the callback of `it(...)` / `test(...)` and their `.only` / `.skip` /
 * `.each(...)` forms, an `expect(<subject>)` chain (with `.not`, `.resolves`,
 * `.rejects` in between) is reported when its matcher checks shape:
 * `toHaveLength(n)`, `toBeDefined()`, `not.toBeUndefined()`, `not.toBeNull()`,
 * `toBeTruthy()`, `toBeFalsy()`, `toBeInstanceOf(...)`,
 * `expect(x.length).toBe(n)` / `toEqual(n)`, `expect(typeof x).toBe(...)`,
 * and `toBeGreaterThan(0)` / `toBeGreaterThanOrEqual(1)` on any subject (a
 * count dressed as a check). Reported at the matcher call.
 *
 * Not reported:
 * - a test that also pins the same subject (compared by source text) with
 *   `toEqual`, `toStrictEqual`, `toMatchObject`, `toContain`, `toContainEqual`,
 *   `toMatch`, `toBe` of a non-boolean literal or `toThrow(<arg>)`: the value
 *   is checked elsewhere. For `x.length` and `typeof x` the subject is `x`;
 * - `toHaveLength(0)` and `expect(x.length).toBe(0)`: an empty result is a
 *   full value check;
 * - `toBeTruthy()` / `toBeFalsy()` on an identifier or call named
 *   is / has / can / should / was...: already a boolean;
 * - `toBeTruthy()` / `not.toBeNull()` on an element query (`getByText("x")`,
 *   `querySelector("[data-x]")`): the query names the element;
 * - `expect.assertions` / `expect.hasAssertions`, which are not assertions.
 *
 * Option `allow` (default `[]`): matcher names switched off.
 *
 * Detect-only: which exact value to assert is the author's call.
 */

import { isTestCall } from "./lib/test-calls.mjs";

const ELEMENT_QUERY = /^(get|find|query)By[A-Z]|^querySelector$|^closest$/;
const BOOLEAN_NAME = /^(is|has|can|should|was)(?![a-z])/;
const PINNING_MATCHERS = new Set([
  "toEqual",
  "toStrictEqual",
  "toMatchObject",
  "toContain",
  "toContainEqual",
  "toMatch",
]);

function isNumberLiteral(node, value) {
  return node?.type === "Literal" && node.value === value;
}

function isLengthMember(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.name === "length"
  );
}

function isTypeof(node) {
  return node.type === "UnaryExpression" && node.operator === "typeof";
}

function calleeNameOf(node) {
  const callee = node.type === "CallExpression" ? node.callee : node;
  if (callee.type === "MemberExpression") {
    return callee.property.name;
  }
  return callee.type === "Identifier" ? callee.name : null;
}

function isBooleanNamed(subject) {
  return BOOLEAN_NAME.test(calleeNameOf(subject) ?? "");
}

function isExpectCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "expect"
  );
}

function isPlainMember(node) {
  return node.type === "MemberExpression" && !node.computed;
}

/** `expect(subject).<modifiers>.matcher(args)` read off a matcher call, or null. */
function readAssertion(call) {
  if (!isPlainMember(call.callee)) {
    return null;
  }
  const modifiers = [];
  let current = call.callee.object;
  while (isPlainMember(current)) {
    modifiers.push(current.property.name);
    current = current.object;
  }
  if (!isExpectCall(current) || current.arguments.length === 0) {
    return null;
  }
  return {
    node: call,
    matcher: call.callee.property.name,
    negated: modifiers.includes("not"),
    subject: current.arguments[0],
    args: call.arguments,
  };
}

function shapeOfCount({ subject, args }) {
  if (isNumberLiteral(args[0], 0)) {
    return null;
  }
  if (isLengthMember(subject)) {
    return ".length";
  }
  return isTypeof(subject) ? "typeof" : null;
}

function negatedOnly(label) {
  return ({ negated }) => (negated ? label : null);
}

function unlessBoolean(label) {
  return ({ subject }) =>
    isBooleanNamed(subject) || isElementQuery(subject) ? null : label;
}

/** `getByText("x")`, `findByRole(...)`, `querySelector("[data-x]")`: the query names the element, so asserting it exists checks a value. */
function isElementQuery(subject) {
  const call = subject.type === "AwaitExpression" ? subject.argument : subject;

  return (
    call.type === "CallExpression" &&
    ELEMENT_QUERY.test(calleeNameOf(call) ?? "")
  );
}

function when(predicate, label) {
  return (assertion) => (predicate(assertion) ? label : null);
}

const WEAK_MATCHERS = {
  toHaveLength: when(
    ({ args }) => !isNumberLiteral(args[0], 0),
    "toHaveLength",
  ),
  toBeDefined: when(({ negated }) => !negated, "toBeDefined"),
  toBeUndefined: negatedOnly("toBeUndefined"),
  toBeNull: ({ negated, subject }) =>
    negated && !isElementQuery(subject) ? "toBeNull" : null,
  toBeTruthy: unlessBoolean("toBeTruthy"),
  toBeFalsy: unlessBoolean("toBeFalsy"),
  toBeInstanceOf: () => "toBeInstanceOf",
  toBe: shapeOfCount,
  toEqual: shapeOfCount,
  toBeGreaterThan: when(
    ({ args }) => isNumberLiteral(args[0], 0),
    "toBeGreaterThan",
  ),
  toBeGreaterThanOrEqual: when(
    ({ args }) => isNumberLiteral(args[0], 1),
    "toBeGreaterThanOrEqual",
  ),
};

function weakLabelOf(assertion, allowed) {
  const label = WEAK_MATCHERS[assertion.matcher]?.(assertion) ?? null;
  return allowed.has(assertion.matcher) || allowed.has(label) ? null : label;
}

function isPinning({ matcher, negated, args }) {
  if (negated) {
    return false;
  }
  if (matcher === "toBe") {
    return args[0]?.type === "Literal" && typeof args[0].value !== "boolean";
  }
  if (matcher === "toThrow") {
    return args.length > 0;
  }
  return PINNING_MATCHERS.has(matcher);
}

function pinnedSubjectOf(subject) {
  if (isLengthMember(subject)) {
    return subject.object;
  }
  return isTypeof(subject) ? subject.argument : subject;
}

function reportWeakAssertions(context, assertions) {
  const allowed = new Set(context.options[0]?.allow ?? []);
  const textOf = (node) => context.sourceCode.getText(node);
  const pinned = new Set(
    assertions.filter(isPinning).map(({ subject }) => textOf(subject)),
  );
  for (const assertion of assertions) {
    const label = weakLabelOf(assertion, allowed);
    const isPinnedElsewhere = pinned.has(
      textOf(pinnedSubjectOf(assertion.subject)),
    );
    if (label !== null && !isPinnedElsewhere) {
      context.report({
        node: assertion.node,
        messageId: "weakAssertion",
        data: { matcher: label },
      });
    }
  }
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow assertions that check the shape of a value instead of the value",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      weakAssertion:
        "`{{matcher}}` checks the shape, not the value: assert what the value is with toEqual / toMatchObject / toContain / toContainEqual, so a wrong value fails the test.",
    },
  },
  create(context) {
    const openTests = [];

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          openTests.push([]);
          return;
        }
        const assertion = openTests.length > 0 ? readAssertion(node) : null;
        if (assertion) {
          openTests[openTests.length - 1].push(assertion);
        }
      },
      "CallExpression:exit"(node) {
        if (isTestCall(node)) {
          reportWeakAssertions(context, openTests.pop());
        }
      },
    };
  },
};
