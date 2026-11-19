/** What a test is to the test rules: `it(...)` / `test(...)`, their `.only` / `.skip` / `.each` / `.concurrent` forms, and `it.each(table)(...)`. */

const TEST_ROOTS = new Set(["it", "test"]);
const TEST_MODIFIERS = new Set(["only", "skip", "each", "concurrent"]);

export function isTestRoot(node) {
  return node.type === "Identifier" && TEST_ROOTS.has(node.name);
}

function isTestModifier(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    isTestRoot(node.object) &&
    TEST_MODIFIERS.has(node.property.name)
  );
}

export function isTestCall(node) {
  const { callee } = node;
  if (isTestRoot(callee) || isTestModifier(callee)) {
    return true;
  }
  // it.each(table)("name", fn) — the callee is itself the `it.each(...)` call
  return callee.type === "CallExpression" && isTestModifier(callee.callee);
}

const STATIC_TEXT = {
  Literal: (node) => (typeof node.value === "string" ? node.value : null),
  TemplateLiteral: (node) =>
    node.expressions.length === 0 ? node.quasis[0].value.cooked : null,
};

/** The test's name when its first argument is a plain string or a template with no expressions. */
export function testNameOf(node) {
  const [first] = node.arguments;
  const read = first ? STATIC_TEXT[first.type] : undefined;

  return read ? read(first) : null;
}
