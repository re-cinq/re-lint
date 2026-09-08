/**
 * no-nondeterministic-tests — a test must produce the same result on every
 * run. A clock read or a random draw inside a test file makes its outcome
 * depend on when and where it ran, which is how "flaky" gets into the
 * vocabulary.
 *
 * Active only in test files (`*.test.*` / `*.spec.*`). What counts:
 *   - `Math.random()`                        — tamed by `vi.spyOn(Math, "random")` / `jest.spyOn(Math, "random")`
 *   - `Date.now()`, `new Date()` (no args),
 *     `performance.now()`                    — tamed by `vi|jest.useFakeTimers()` / `vi|jest.setSystemTime()`
 *   - `crypto.randomUUID()`                  — tamed by `vi|jest.mock("crypto")` / `("node:crypto")`
 * A taming call anywhere in the file (any `beforeEach`, any test) exempts
 * its whole category: the visitor collects offenders and taming markers in
 * one pass and decides at `Program:exit`, so order within the file does not
 * matter. `new Date("2026-01-01")` is a fixed value and is never reported.
 *
 * Detect-only: the fix is to inject the clock/random source or fake it.
 */

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_FRAMEWORKS = new Set(["vi", "jest"]);
const CRYPTO_MODULE = /^(node:)?crypto$/;

const OFFENDER_CATEGORY = {
  "Math.random": "random",
  "Date.now": "time",
  "performance.now": "time",
  "crypto.randomUUID": "uuid",
};

function isIdentifierPair(callee) {
  return (
    callee.object.type === "Identifier" && callee.property.type === "Identifier"
  );
}

function memberCallName(node) {
  const { callee } = node;
  const isPlainMember = callee.type === "MemberExpression" && !callee.computed;
  if (!isPlainMember || !isIdentifierPair(callee)) {
    return null;
  }
  return { object: callee.object.name, method: callee.property.name };
}

function isMathRandomSpy(node) {
  const [target, method] = node.arguments;
  return (
    target?.type === "Identifier" &&
    target.name === "Math" &&
    method?.type === "Literal" &&
    method.value === "random"
  );
}

function isCryptoMock(node) {
  const [moduleName] = node.arguments;
  return (
    moduleName?.type === "Literal" &&
    CRYPTO_MODULE.test(String(moduleName.value))
  );
}

const TAMERS = {
  useFakeTimers: () => "time",
  setSystemTime: () => "time",
  spyOn: (node) => (isMathRandomSpy(node) ? "random" : null),
  mock: (node) => (isCryptoMock(node) ? "uuid" : null),
};

function tamedCategory(node, name) {
  if (!TEST_FRAMEWORKS.has(name.object)) {
    return null;
  }
  const tamer = TAMERS[name.method];
  return tamer ? tamer(node) : null;
}

function collectCall(node, found) {
  const name = memberCallName(node);
  if (!name) {
    return;
  }
  const call = `${name.object}.${name.method}`;
  const category = OFFENDER_CATEGORY[call];
  if (category) {
    found.offenders.push({ node, call: `${call}()`, category });
    return;
  }
  const tamedBy = tamedCategory(node, name);
  if (tamedBy) {
    found.tamed.add(tamedBy);
  }
}

function collectBareDate(node, found) {
  const isBareDate =
    node.callee.type === "Identifier" &&
    node.callee.name === "Date" &&
    node.arguments.length === 0;
  if (isBareDate) {
    found.offenders.push({ node, call: "new Date()", category: "time" });
  }
}

function reportUntamed(context, found) {
  found.offenders
    .filter(({ category }) => !found.tamed.has(category))
    .forEach(({ node, call }) =>
      context.report({ node, messageId: "nondeterministic", data: { call } }),
    );
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Math.random, Date.now, new Date(), performance.now and crypto.randomUUID in test files unless faked (useFakeTimers / setSystemTime / spyOn Math.random / mock crypto)",
    },
    schema: [
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    ],
    messages: {
      nondeterministic:
        "{{call}} makes this test non-repeatable; inject the value or use fake timers",
    },
  },
  create(context) {
    if (!TEST_FILE.test(context.filename)) {
      return {};
    }
    const found = { offenders: [], tamed: new Set() };
    return {
      CallExpression: (node) => collectCall(node, found),
      NewExpression: (node) => collectBareDate(node, found),
      "Program:exit": () => reportUntamed(context, found),
    };
  },
};
