/**
 * no-guard-mock-always-allows — a test that mocks the check deciding who may do
 * something must also make that check say no somewhere. A route test that
 * mocks `userCanAccessRepo` to resolve `true` and never to resolve `false`
 * cannot notice the day the route stops calling it.
 *
 * Option `guards` (required): `{ module }` entries, the specifiers of modules
 * that decide access. A file that calls `vi.mock` / `vi.doMock` /
 * `jest.mock` / `jest.doMock` with one of them, matched exactly, must hold a
 * denial for it. Reported once per mocked guard module, at its first mock call.
 *
 * What is a denial, anywhere in the file: `mockResolvedValue(false)`,
 * `mockReturnValue(false)` and their `Once` forms; the same with an object
 * carrying `allowed: false`, `ok: false` or a numeric `status` of 400 or more;
 * any `mockRejectedValue(...)` / `mockRejectedValueOnce(...)`; a
 * `mockImplementation(...)` / `mockImplementationOnce(...)` whose function
 * holds a `throw` or a literal `false`.
 *
 * Whose denial it is: one inside the module's own mock factory, or on a name
 * imported from the module (also as `vi.mocked(name)`), belongs to that
 * module. Any other denial, on a receiver the rule cannot trace, counts for
 * every guard in the file.
 *
 * Option `deny` (default none): extra method names that count as a denial when
 * called anywhere, as a method or as a plain function, such as a test helper
 * `denyAccess`.
 *
 * Detect-only: the fix is the test where the guard says no.
 */

const MOCK_ROOTS = new Set(["vi", "jest"]);
const MOCK_METHODS = new Set(["mock", "doMock"]);
const VALUE_METHODS = new Set([
  "mockResolvedValue",
  "mockResolvedValueOnce",
  "mockReturnValue",
  "mockReturnValueOnce",
]);
const REJECTION_METHODS = new Set([
  "mockRejectedValue",
  "mockRejectedValueOnce",
]);
const IMPLEMENTATION_METHODS = new Set([
  "mockImplementation",
  "mockImplementationOnce",
]);
const REFUSING_FLAGS = new Set(["allowed", "ok"]);

function methodNameOf(node) {
  const { callee } = node;
  if (callee.type !== "MemberExpression" || callee.computed) {
    return null;
  }
  return callee.property.type === "Identifier" ? callee.property.name : null;
}

function stringValueOf(node) {
  return node?.type === "Literal" && typeof node.value === "string"
    ? node.value
    : null;
}

function isMockCall(node) {
  return (
    node.type === "CallExpression" &&
    MOCK_METHODS.has(methodNameOf(node)) &&
    MOCK_ROOTS.has(node.callee.object.name)
  );
}

function mockedModuleOf(node) {
  return isMockCall(node) ? stringValueOf(node.arguments[0]) : null;
}

function isFalse(node) {
  return node?.type === "Literal" && node.value === false;
}

function keyNameOf(property) {
  if (property.type !== "Property" || property.computed) {
    return null;
  }
  return property.key.type === "Identifier" ? property.key.name : null;
}

function isRefusingProperty(property) {
  const name = keyNameOf(property);
  if (REFUSING_FLAGS.has(name)) {
    return isFalse(property.value);
  }
  const { value } = property;
  return (
    name === "status" &&
    value.type === "Literal" &&
    typeof value.value === "number" &&
    value.value >= 400
  );
}

function isRefusingAnswer(argument) {
  if (isFalse(argument)) {
    return true;
  }
  return (
    argument?.type === "ObjectExpression" &&
    argument.properties.some(isRefusingProperty)
  );
}

function isDenialCall(node, deny) {
  const name = methodNameOf(node) ?? node.callee.name;
  if (name === undefined) {
    return false;
  }
  if (deny.includes(name) || REJECTION_METHODS.has(name)) {
    return true;
  }
  return VALUE_METHODS.has(name) && isRefusingAnswer(node.arguments[0]);
}

const ROOT_STEPS = {
  MemberExpression: (node) => node.object,
  CallExpression: (node) =>
    methodNameOf(node) === "mocked" ? node.arguments[0] : node.callee,
};

function rootNameOf(node) {
  if (node?.type === "Identifier") {
    return node.name;
  }
  const step = ROOT_STEPS[node?.type];
  return step ? rootNameOf(step(node)) : null;
}

function isImplementationCall(node) {
  return (
    node.type === "CallExpression" &&
    IMPLEMENTATION_METHODS.has(methodNameOf(node))
  );
}

/** The module a denial belongs to, or null when it cannot be traced. */
function moduleOfDenial(call, ancestors, importedFrom) {
  const enclosingMock = ancestors.find(
    (ancestor) => mockedModuleOf(ancestor) !== null,
  );
  if (enclosingMock) {
    return mockedModuleOf(enclosingMock);
  }
  return importedFrom.get(rootNameOf(call.callee.object)) ?? null;
}

function createDenials() {
  const denied = new Set();
  let deniedForAll = false;

  return {
    add(module) {
      if (module === null) {
        deniedForAll = true;
        return;
      }
      denied.add(module);
    },
    covers: (module) => deniedForAll || denied.has(module),
  };
}

function trackGuardMocks(guards) {
  const guardModules = new Set(guards.map((guard) => guard.module));
  const mocked = new Map();

  return {
    mocked,
    CallExpression(node) {
      const module = mockedModuleOf(node);
      if (guardModules.has(module) && !mocked.has(module)) {
        mocked.set(module, node);
      }
    },
  };
}

function trackDenials(sourceCode, deny, importedFrom) {
  const denied = createDenials();
  const record = (call, ancestors) =>
    denied.add(moduleOfDenial(call, ancestors, importedFrom));
  const recordImplementationDenial = (node) => {
    const ancestors = sourceCode.getAncestors(node);
    const index = ancestors.findLastIndex(isImplementationCall);
    if (index >= 0) {
      record(ancestors[index], ancestors.slice(0, index));
    }
  };

  return {
    covers: denied.covers,
    CallExpression(node) {
      if (isDenialCall(node, deny)) {
        record(node, sourceCode.getAncestors(node));
      }
    },
    ThrowStatement: recordImplementationDenial,
    Literal(node) {
      if (isFalse(node)) {
        recordImplementationDenial(node);
      }
    },
  };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "require a test that mocks an access guard to also make it refuse",
    },
    schema: [
      {
        type: "object",
        properties: {
          guards: {
            description: "Modules whose functions decide who may do something",
            type: "array",
            items: {
              type: "object",
              properties: { module: { type: "string" } },
              required: ["module"],
              additionalProperties: false,
            },
          },
          deny: {
            description: "Method names that count as a denial when called",
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["guards"],
        additionalProperties: false,
      },
    ],
    messages: {
      alwaysAllows:
        "`{{module}}` is mocked and never refuses in this file: add a test where it says no (mockResolvedValue(false), a rejection), or the code under test can skip the check unnoticed.",
    },
  },

  create(context) {
    const { guards, deny = [] } = context.options[0];
    const importedFrom = new Map();
    const guardMocks = trackGuardMocks(guards);
    const denials = trackDenials(context.sourceCode, deny, importedFrom);

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          importedFrom.set(specifier.local.name, node.source.value);
        }
      },
      CallExpression(node) {
        guardMocks.CallExpression(node);
        denials.CallExpression(node);
      },
      ThrowStatement: denials.ThrowStatement,
      Literal: denials.Literal,
      "Program:exit"() {
        for (const [module, node] of guardMocks.mocked) {
          if (!denials.covers(module)) {
            context.report({
              node,
              messageId: "alwaysAllows",
              data: { module },
            });
          }
        }
      },
    };
  },
};
