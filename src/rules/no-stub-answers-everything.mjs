/**
 * no-stub-answers-everything — a test file that stubs `fetch` must also make
 * it fail somewhere. A reader that fails soft answers 200 or an empty list
 * when its backend refuses; when every test stubs the backend to succeed,
 * "the backend says no" never runs and nothing notices.
 *
 * A stub is `vi.stubGlobal("fetch", …)`, `globalThis.fetch = …` (or `global`),
 * `vi.spyOn(globalThis | global | window, "fetch")` and the `jest` forms.
 * A failure, anywhere in the file, is any of: `status: N` with a numeric
 * literal N >= 400; `ok: false`; `Response.error()`; `.mockRejectedValue(…)` /
 * `.mockRejectedValueOnce(…)`; a `throw` or `Promise.reject(…)` inside a stub
 * or inside a function whose name contains "fetch", "stub" or "answer", or
 * inside a `vi.fn(…)` / `jest.fn(…)` / `.mockImplementation(…)` fake.
 * Reports once, at the first stub.
 */

const GLOBAL_OBJECTS = new Set(["globalThis", "global", "window"]);
const FAILING_MOCKS = new Set(["mockRejectedValue", "mockRejectedValueOnce"]);
const FAKE_FUNCTION_NAME = /fetch|stub|answer/i;

function isIdentifier(node, names) {
  return node?.type === "Identifier" && names.has(node.name);
}

function isLiteral(node, value) {
  return node?.type === "Literal" && node.value === value;
}

function methodNameOf(node) {
  const { callee } = node;
  const isMethod = callee.type === "MemberExpression" && !callee.computed;

  return isMethod ? callee.property.name : null;
}

function isTestDouble(node) {
  return isIdentifier(node.callee.object, new Set(["vi", "jest"]));
}

function isStubGlobalCall([first]) {
  return isLiteral(first, "fetch");
}

function isSpyOnCall([first, second]) {
  return isIdentifier(first, GLOBAL_OBJECTS) && isLiteral(second, "fetch");
}

const STUB_CHECKS = { stubGlobal: isStubGlobalCall, spyOn: isSpyOnCall };

function isStubCall(node) {
  const check = STUB_CHECKS[methodNameOf(node)];

  return check !== undefined && isTestDouble(node) && check(node.arguments);
}

function isFetchAssignment(node) {
  const { left } = node;

  return (
    left.type === "MemberExpression" &&
    !left.computed &&
    isIdentifier(left.object, GLOBAL_OBJECTS) &&
    left.property.name === "fetch"
  );
}

function isNumberAtLeast(node, floor) {
  return (
    node?.type === "Literal" &&
    typeof node.value === "number" &&
    node.value >= floor
  );
}

function keyNameOf(property) {
  return property.key.name ?? property.key.value;
}

function isFailingProperty(property) {
  const key = keyNameOf(property);

  return (
    (key === "status" && isNumberAtLeast(property.value, 400)) ||
    (key === "ok" && isLiteral(property.value, false))
  );
}

function isMemberCall(node, objectName, method) {
  return (
    isIdentifier(node.callee.object, new Set([objectName])) &&
    methodNameOf(node) === method
  );
}

function isFailingCall(node) {
  return (
    FAILING_MOCKS.has(methodNameOf(node)) ||
    isMemberCall(node, "Response", "error")
  );
}

function isFakeFunction(node) {
  const name = node.id?.name ?? node.parent?.id?.name ?? "";

  return FAKE_FUNCTION_NAME.test(name);
}

const MOCK_FUNCTIONS = new Set([
  "fn",
  "mockImplementation",
  "mockImplementationOnce",
]);

/** `vi.fn(() => …)` and `.mockImplementation(…)`: a fake whose body may throw or reject, whatever it is later called. */
function isMockFunctionCall(node) {
  return MOCK_FUNCTIONS.has(methodNameOf(node));
}

const FAKE_CONTEXTS = {
  FunctionDeclaration: isFakeFunction,
  FunctionExpression: isFakeFunction,
  ArrowFunctionExpression: isFakeFunction,
  CallExpression: (node) => isStubCall(node) || isMockFunctionCall(node),
  AssignmentExpression: isFetchAssignment,
};

function isInsideFake(ancestors) {
  return ancestors.some((ancestor) => FAKE_CONTEXTS[ancestor.type]?.(ancestor));
}

function callFactsOf(node) {
  const isMember = node.callee.type === "MemberExpression";

  return {
    isStub: isMember && isStubCall(node),
    isFailure: isMember && isFailingCall(node),
    isRejection: isMember && isMemberCall(node, "Promise", "reject"),
  };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a test file that stubs fetch to also make it fail somewhere",
    },
    schema: [],
    messages: {
      alwaysAnswers:
        "fetch is stubbed and never fails in this file: add a test where the upstream answers an error or throws, so a reader that fails soft (answering 200 or an empty list) is caught.",
    },
  },
  create(context) {
    let firstStub = null;
    let hasFailure = false;

    const noteStub = (node, isStub) => {
      firstStub ??= isStub ? node : null;
    };
    const noteThrow = (node, isThrow = true) => {
      const ancestors = context.sourceCode.getAncestors(node);
      hasFailure ||= isThrow && isInsideFake(ancestors);
    };

    return {
      CallExpression(node) {
        const facts = callFactsOf(node);
        hasFailure ||= facts.isFailure;
        noteStub(node, facts.isStub);
        noteThrow(node, facts.isRejection);
      },
      AssignmentExpression(node) {
        noteStub(node, isFetchAssignment(node));
      },
      Property: (node) => (hasFailure ||= isFailingProperty(node)),
      ThrowStatement: (node) => noteThrow(node),
      "Program:exit"() {
        if (firstStub && !hasFailure) {
          context.report({ node: firstStub, messageId: "alwaysAnswers" });
        }
      },
    };
  },
};
