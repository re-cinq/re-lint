/**
 * refusal-asserts-no-side-effect — a refusal test must also show that nothing
 * happened. A route can answer 403 after it has already written: a test
 * named "refuses ..." that checks only the status passes against code that
 * still wrote.
 *
 * A test (`it` / `test`, name read as static text) whose name matches the
 * option `pattern` (a case-insensitive regex; default: refuses, rejects,
 * denies, forbids, blocks, or answers / returns / responds 40x) must hold at
 * least one no-effect assertion in its callback:
 * - `not.toHaveBeenCalled()`, `not.toHaveBeenCalledWith(...)`,
 *   `not.toHaveBeenLastCalledWith(...)`, `toHaveBeenCalledTimes(0)`;
 * - `toHaveLength(0)`, `toEqual([])`, `toStrictEqual([])`;
 * - `toBe(0)` / `toEqual(0)` on a subject ending in `.length`, `Count`,
 *   `count` or `size`;
 * - an object literal given to `toEqual` / `toMatchObject` / `toStrictEqual`
 *   with a property whose value is `[]` or `0`;
 * - a call named in the option `noEffectMatchers`.
 *
 * Detect-only: which effect to rule out is the author's to say.
 */

import { isTestCall, testNameOf } from "./lib/test-calls.mjs";

// `blocks` is left out: "several thinking blocks" is a noun. `rejects` only as the code's verb ("rejects a wrong type"): "when the fetch rejects" names an upstream failure, not a refusal.
const DEFAULT_PATTERN =
  "\\b(refuses|denies|forbids)\\b|\\brejects (a|an|the|any|every)\\b|\\b(answers|returns|responds( with)?) 40[0-9]\\b";

const EMPTY_VALUE_MATCHERS = new Set([
  "toEqual",
  "toMatchObject",
  "toStrictEqual",
]);
const EMPTY_LIST_MATCHERS = new Set(["toEqual", "toStrictEqual"]);
const ZERO_MATCHERS = new Set(["toBe", "toEqual"]);
const NEGATED_CALL_MATCHERS = new Set([
  "toHaveBeenCalled",
  "toHaveBeenCalledWith",
  "toHaveBeenLastCalledWith",
]);

function isLiteral(node, value) {
  return node?.type === "Literal" && node.value === value;
}

function isEmptyArray(node) {
  return node?.type === "ArrayExpression" && node.elements.length === 0;
}

function isEmptyValue(node) {
  return isEmptyArray(node) || isLiteral(node, 0);
}

function hasEmptyProperty(node) {
  return (
    node?.type === "ObjectExpression" &&
    node.properties.some(
      (property) =>
        property.type === "Property" && isEmptyValue(property.value),
    )
  );
}

function expectChainOf(callee) {
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

  return isExpectCall ? { subject: current.arguments[0], modifiers } : null;
}

function isNegatedCall({ matcher, modifiers }) {
  return modifiers.join() === "not" && NEGATED_CALL_MATCHERS.has(matcher);
}

function isEmptyResult({ matcher, args }) {
  const isEmptyList = EMPTY_LIST_MATCHERS.has(matcher) && isEmptyArray(args[0]);
  const isEmptyLength = matcher === "toHaveLength" && isLiteral(args[0], 0);
  const isZeroCalls =
    matcher === "toHaveBeenCalledTimes" && isLiteral(args[0], 0);

  return isEmptyList || isEmptyLength || isZeroCalls;
}

function isZeroCount({ matcher, args, subjectText }) {
  const isCount = /(\.length|Count|count|size)$/.test(subjectText);

  return isCount && ZERO_MATCHERS.has(matcher) && isLiteral(args[0], 0);
}

function isEmptyProperty({ matcher, args }) {
  return EMPTY_VALUE_MATCHERS.has(matcher) && hasEmptyProperty(args[0]);
}

const ASSERTION_KINDS = [
  isNegatedCall,
  isEmptyResult,
  isZeroCount,
  isEmptyProperty,
];

function calleeNameOf(callee) {
  const isMember = callee.type === "MemberExpression" && !callee.computed;

  return isMember ? callee.property.name : callee.name;
}

function isCustomEffectCall(node, noEffectMatchers) {
  return noEffectMatchers.includes(calleeNameOf(node.callee));
}

function factsOf(node, sourceCode) {
  const chain =
    node.callee.type === "MemberExpression" && expectChainOf(node.callee);
  if (!chain) {
    return null;
  }

  return {
    ...chain,
    matcher: node.callee.property.name,
    args: node.arguments,
    subjectText: chain.subject ? sourceCode.getText(chain.subject) : "",
  };
}

function isEffectAssertion(facts) {
  return ASSERTION_KINDS.some((kind) => kind(facts));
}

function trackerOf(context) {
  const options = context.options[0] ?? {};
  const refusalName = new RegExp(options.pattern ?? DEFAULT_PATTERN, "i");
  const noEffectMatchers = options.noEffectMatchers ?? [];
  const openTests = [];

  return {
    isInsideTest: () => openTests.length > 0,
    enter(node) {
      const name = testNameOf(node);
      const isRefusal = name !== null && refusalName.test(name);
      openTests.push({ node, name, isRefusal, hasEffectCheck: false });
    },
    exit() {
      const { node, name, isRefusal, hasEffectCheck } = openTests.pop();
      if (isRefusal && !hasEffectCheck) {
        context.report({ node, messageId: "noEffectChecked", data: { name } });
      }
    },
    note(node) {
      const facts = factsOf(node, context.sourceCode);
      const isEffectCheck =
        (facts && isEffectAssertion(facts)) ||
        isCustomEffectCall(node, noEffectMatchers);
      if (isEffectCheck) {
        openTests.at(-1).hasEffectCheck = true;
      }
    },
  };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a refusal test to assert that the write or call did not run",
    },
    schema: [
      {
        type: "object",
        properties: {
          pattern: { type: "string" },
          noEffectMatchers: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noEffectChecked:
        '"{{name}}" is a refusal test that does not show nothing happened: assert the write or call did not run (not.toHaveBeenCalled(), toHaveBeenCalledTimes(0), an empty list of writes), so a check that refuses after the write fails it.',
    },
  },
  create(context) {
    const tracker = trackerOf(context);

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          tracker.enter(node);
          return;
        }
        if (tracker.isInsideTest()) {
          tracker.note(node);
        }
      },
      "CallExpression:exit"(node) {
        if (isTestCall(node)) {
          tracker.exit();
        }
      },
    };
  },
};
