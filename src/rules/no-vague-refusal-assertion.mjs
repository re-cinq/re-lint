/**
 * no-vague-refusal-assertion — a refusal test must name the refusal. A test
 * that asserts "not 200" passes for a route that answers 400 because it
 * judged the request before the caller, and for one that crashes with 500. An
 * assertion that
 * every failure satisfies cannot tell the refusal from a crash or a typo.
 *
 * Inside the callback of `it(...)` / `test(...)`, reports at the matcher call:
 * - `toThrow()` / `toThrowError()` with no argument, also after `rejects`
 *   (`not.toThrow()` says nothing was thrown, which is exact);
 * - `rejects.toBeDefined()`, `rejects.toBeTruthy()` and
 *   `rejects.toBeInstanceOf(Error)` (the bare `Error`; a specific class is fine);
 * - `not.toBe(n)` / `not.toEqual(n)` with n a literal from 200 to 299;
 * - a subject ending in `status`, `statusCode` or `code` asserted with
 *   `toBeGreaterThanOrEqual(400..599)` or `toBeGreaterThan(399..598)`;
 * - a subject ending in `.ok` asserted with `toBe(false)` or `toBeFalsy()`.
 *
 * Detect-only: which refusal the code owes is the author's to say.
 */

import { isTestCall } from "./lib/test-calls.mjs";

function isNumberBetween(node, low, high) {
  return (
    node?.type === "Literal" &&
    typeof node.value === "number" &&
    node.value >= low &&
    node.value <= high
  );
}

function chainOf(callee) {
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

function isBareErrorClass(node) {
  return node?.type === "Identifier" && node.name === "Error";
}

function isFalseLiteral(node) {
  return node?.type === "Literal" && node.value === false;
}

function bareThrow({ matcher, args, modifiers }) {
  const isThrow = matcher === "toThrow" || matcher === "toThrowError";
  const isBare = isThrow && args.length === 0 && !modifiers.includes("not");

  return isBare ? `${matcher}() with no argument` : null;
}

const REJECTION_DESCRIPTIONS = {
  toBeDefined: () => "rejects.toBeDefined()",
  toBeTruthy: () => "rejects.toBeTruthy()",
  toBeInstanceOf: (args) =>
    isBareErrorClass(args[0]) ? "rejects.toBeInstanceOf(Error)" : null,
};

function vagueRejection({ matcher, args, modifiers }) {
  const describe = REJECTION_DESCRIPTIONS[matcher];

  return modifiers.includes("rejects") && describe ? describe(args) : null;
}

function negatedSuccess({ matcher, args, modifiers }) {
  const isEquality = matcher === "toBe" || matcher === "toEqual";
  const isNegated = modifiers.join() === "not";

  return isEquality && isNegated && isNumberBetween(args[0], 200, 299)
    ? `not.${matcher}(${args[0].value})`
    : null;
}

const STATUS_FLOORS = {
  toBeGreaterThanOrEqual: { low: 400, high: 599 },
  toBeGreaterThan: { low: 399, high: 598 },
};

function statusAtLeast({ matcher, args, modifiers, subjectText }) {
  const floors = STATUS_FLOORS[matcher];
  const isStatus = /(status|statusCode|code)$/.test(subjectText);
  const isBareSubject = isStatus && modifiers.length === 0;
  const isVague =
    isBareSubject &&
    floors !== undefined &&
    isNumberBetween(args[0], floors.low, floors.high);

  return isVague ? "status >= 400" : null;
}

const OK_FALSE_CHECKS = {
  toBeFalsy: () => true,
  toBe: (args) => isFalseLiteral(args[0]),
};

function okIsFalse({ matcher, args, modifiers, subjectText }) {
  const check = OK_FALSE_CHECKS[matcher];
  const isOk = /\.ok$/.test(subjectText);

  return isOk && modifiers.length === 0 && check?.(args) ? "ok is false" : null;
}

const DETECTORS = [
  bareThrow,
  vagueRejection,
  negatedSuccess,
  statusAtLeast,
  okIsFalse,
];

function factsOf(node, sourceCode) {
  const chain = chainOf(node.callee);
  if (chain === null) {
    return null;
  }

  return {
    ...chain,
    matcher: node.callee.property.name,
    args: node.arguments,
    subjectText: chain.subject ? sourceCode.getText(chain.subject) : "",
  };
}

function vagueFindingOf(facts) {
  return DETECTORS.map((detect) => detect(facts)).find(Boolean) ?? null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow refusal assertions that any failure, a crash included, satisfies",
    },
    schema: [],
    messages: {
      vagueRefusal:
        '`{{found}}` passes for any failure, a crash or a typo included: assert the exact refusal (toThrow(new Error("…")), toBe(403), toEqual({ status: 403, … })).',
    },
  },
  create(context) {
    let openTests = 0;

    function check(node) {
      const facts = factsOf(node, context.sourceCode);
      const found = facts && vagueFindingOf(facts);
      if (found) {
        context.report({ node, messageId: "vagueRefusal", data: { found } });
      }
    }

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          openTests += 1;
          return;
        }
        if (openTests > 0 && node.callee.type === "MemberExpression") {
          check(node);
        }
      },
      "CallExpression:exit"(node) {
        if (isTestCall(node)) {
          openTests -= 1;
        }
      },
    };
  },
};
