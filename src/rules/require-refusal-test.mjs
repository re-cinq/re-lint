/**
 * require-refusal-test — a test file of an entry point must hold one test that
 * asserts a refusal. An entry point whose tests only check a 200 page can
 * answer anyone and no test notices. Scope the rule with `files:` to the tests
 * of routes and tools.
 *
 * A refusal assertion, inside the callback of `it(...)` / `test(...)`:
 * - `toThrow(x)` / `toThrowError(x)` with an argument, `rejects.` chains too;
 * - any matcher with an argument after `.rejects.`;
 * - `toBe(n)` / `toEqual(n)` with a numeric literal from 400 to 599;
 * - `toEqual` / `toMatchObject` / `toStrictEqual` of an object literal whose
 *   `status` or `statusCode` is a numeric literal of 400 or more;
 * - a call to a name in the option `refusalMatchers` (default none).
 *
 * Reports once, at the first test, when the file has tests and none refuses.
 */

import { isTestCall } from "./lib/test-calls.mjs";

const OBJECT_MATCHERS = new Set(["toEqual", "toMatchObject", "toStrictEqual"]);
const STATUS_KEYS = new Set(["status", "statusCode"]);

function isNumberAtLeast(node, low, high = Infinity) {
  return (
    node?.type === "Literal" &&
    typeof node.value === "number" &&
    node.value >= low &&
    node.value <= high
  );
}

function modifiersOf(callee) {
  const modifiers = [];
  let current = callee.object;
  while (current.type === "MemberExpression" && !current.computed) {
    modifiers.push(current.property.name);
    current = current.object;
  }
  const isExpectCall =
    current.type === "CallExpression" &&
    current.callee.type === "Identifier" &&
    current.callee.name === "expect";

  return isExpectCall ? modifiers : null;
}

function isFailingStatusProperty(property) {
  return (
    property.type === "Property" &&
    STATUS_KEYS.has(property.key.name) &&
    isNumberAtLeast(property.value, 400)
  );
}

function thrownWithArgument({ matcher, args }) {
  const isThrow = matcher === "toThrow" || matcher === "toThrowError";

  return isThrow && args.length > 0;
}

function rejectedWithArgument({ modifiers, args }) {
  return modifiers.includes("rejects") && args.length > 0;
}

function failingStatusNumber({ matcher, args }) {
  const isEquality = matcher === "toBe" || matcher === "toEqual";

  return isEquality && isNumberAtLeast(args[0], 400, 599);
}

function failingStatusObject({ matcher, args }) {
  const [argument] = args;
  const isObject = argument?.type === "ObjectExpression";

  return (
    OBJECT_MATCHERS.has(matcher) &&
    isObject &&
    argument.properties.some(isFailingStatusProperty)
  );
}

const ASSERTIONS = [
  thrownWithArgument,
  rejectedWithArgument,
  failingStatusNumber,
  failingStatusObject,
];

function isRefusalAssertion(node) {
  const modifiers = modifiersOf(node.callee);
  const facts = {
    modifiers,
    matcher: node.callee.property.name,
    args: node.arguments,
  };

  return modifiers !== null && ASSERTIONS.some((holds) => holds(facts));
}

function calleeNameOf(callee) {
  return callee.type === "Identifier" ? callee.name : callee.property?.name;
}

function isRefusal(node, houseMatchers) {
  const isNamed = houseMatchers.has(calleeNameOf(node.callee));
  const isAssertion =
    node.callee.type === "MemberExpression" && isRefusalAssertion(node);

  return isNamed || isAssertion;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a test file of an entry point to hold a test that asserts a refusal",
    },
    schema: [
      {
        type: "object",
        properties: {
          refusalMatchers: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noRefusal:
        "No test in this file asserts a refusal: add one where the caller is refused (a 401/403, a thrown error, a rejection), or the entry point can answer anyone and no test notices.",
    },
  },
  create(context) {
    const houseMatchers = new Set(context.options[0]?.refusalMatchers ?? []);
    let openTests = 0;
    let firstTest = null;
    let hasRefusal = false;

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          openTests += 1;
          firstTest ??= node;
          return;
        }
        hasRefusal ||= openTests > 0 && isRefusal(node, houseMatchers);
      },
      "CallExpression:exit"(node) {
        if (isTestCall(node)) {
          openTests -= 1;
        }
      },
      "Program:exit"() {
        if (firstTest && !hasRefusal) {
          context.report({ node: firstTest, messageId: "noRefusal" });
        }
      },
    };
  },
};
