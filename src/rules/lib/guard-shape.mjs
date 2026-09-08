/**
 * The AST vocabulary shared by the guard-rewriting rules (`prefer-enforce-true`,
 * `prefer-api-error`): what a guard's test NARROWS, how to say that test
 * positively, and how to inject the helper import the rewrite needs.
 *
 * Extracted verbatim from prefer-enforce-true so both rules answer "is this
 * rewrite safe?" the same way — the narrowing question in particular has a
 * subtle answer (see `narrowedRoots`) that must not be re-derived per rule.
 */

import path from "node:path";

const FLIPPED_OPERATOR = {
  "===": "!==",
  "!==": "===",
  "==": "!=",
  "!=": "==",
  "<": ">=",
  ">": "<=",
  "<=": ">",
  ">=": "<",
};

function memberChainRoot(node) {
  let current = node;
  while (current?.type === "MemberExpression") current = current.object;
  return current;
}

const ROOT_NAME_BY_TYPE = {
  ThisExpression: () => "this",
  Identifier: (node) => node.name,
};

export function rootIdentifier(node) {
  const root = memberChainRoot(node);
  const nameOf = ROOT_NAME_BY_TYPE[root?.type];
  return nameOf ? nameOf(root) : null;
}

export function isNegation(node) {
  return node.type === "UnaryExpression" && node.operator === "!";
}

// `typeof x === "y"` narrows x, so look through the typeof to its operand.
function narrowTarget(node) {
  return node.type === "UnaryExpression" && node.operator === "typeof"
    ? node.argument
    : node;
}

function rootsOf(node) {
  const root = rootIdentifier(node);
  return root ? [root] : [];
}

const EQUALITY_OPERATORS = new Set(["===", "!==", "==", "!="]);

function isUndefinedIdentifier(node) {
  return node.type === "Identifier" && node.name === "undefined";
}

function equalityRoots(test) {
  return [test.left, test.right]
    .filter((side) => side.type !== "Literal" && !isUndefinedIdentifier(side))
    .map((side) => rootIdentifier(narrowTarget(side)))
    .filter(Boolean);
}

// `"error" in result` narrows the RIGHT operand — the discriminated branch
// is where `result.error` exists at all.
const BINARY_ROOTS_BY_OPERATOR = {
  instanceof: (test) => rootsOf(test.left),
  in: (test) => rootsOf(test.right),
};

function binaryRoots(test) {
  const byOperator = BINARY_ROOTS_BY_OPERATOR[test.operator];
  if (byOperator) return byOperator(test);
  return EQUALITY_OPERATORS.has(test.operator) ? equalityRoots(test) : [];
}

// `!x` narrows the same reference as `x`; recurse through the negation.
// A method-call result (`if (m.has(x))`) is not a narrowable reference.
const NARROWED_ROOTS_BY_TYPE = {
  UnaryExpression: (test) =>
    isNegation(test) ? narrowedRoots(test.argument) : [],
  Identifier: rootsOf,
  MemberExpression: rootsOf,
  ThisExpression: rootsOf,
  BinaryExpression: binaryRoots,
};

/**
 * Identifiers the test *narrows*. enforceTrue asserts the condition after the
 * call, so its arguments are typed WITHOUT that narrowing — if the guard's
 * payload reads a narrowed variable (`if (!r.ok) throw r.error`), the rewrite
 * loses the narrowing and breaks. Callers skip those.
 */
export function narrowedRoots(test) {
  const roots = NARROWED_ROOTS_BY_TYPE[test.type];
  return roots ? roots(test) : [];
}

function isAstNode(value) {
  return Boolean(value) && typeof value.type === "string";
}

function childNodes(node) {
  return Object.entries(node)
    .filter(([key]) => key !== "parent")
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter(isAstNode);
}

export function identifiersIn(node, acc = new Set()) {
  if (!isAstNode(node)) return acc;
  const leafName = ROOT_NAME_BY_TYPE[node.type];
  if (leafName) {
    acc.add(leafName(node));
    return acc;
  }
  for (const child of childNodes(node)) identifiersIn(child, acc);
  return acc;
}

/** True when rewriting the guard would strip narrowing its payload depends on. */
export function payloadDependsOnNarrowing(test, payloadNode) {
  const narrowed = narrowedRoots(test);
  if (!narrowed.length) return false;
  const ids = identifiersIn(payloadNode);
  return narrowed.some((root) => ids.has(root));
}

/** The guard's test said the other way round, as source text. */
export function positiveConditionText(test, sourceCode) {
  if (isNegation(test)) return sourceCode.getText(test.argument);
  if (test.type === "BinaryExpression" && FLIPPED_OPERATOR[test.operator]) {
    const left = sourceCode.getText(test.left);
    const right = sourceCode.getText(test.right);
    return `${left} ${FLIPPED_OPERATOR[test.operator]} ${right}`;
  }
  return `!(${sourceCode.getText(test)})`;
}

/** The single statement of a guard's consequent, if it has exactly one of `type`. */
export function soleStatementOf(consequent, type) {
  if (consequent.type === type) return consequent;
  if (
    consequent.type === "BlockStatement" &&
    consequent.body.length === 1 &&
    consequent.body[0].type === type
  ) {
    return consequent.body[0];
  }
  return null;
}

function isDirective(statement) {
  return (
    statement.type === "ExpressionStatement" &&
    statement.expression.type === "Literal" &&
    typeof statement.expression.value === "string"
  );
}

// The import must land after any leading directive prologue
// (`"use client"`, `"use strict"`), which has to stay the first statement.
function lastDirectiveOf(program) {
  let lastDirective = null;
  for (const statement of program.body) {
    if (!isDirective(statement)) return lastDirective;
    lastDirective = statement;
  }
  return lastDirective;
}

function importedNames(declaration) {
  return new Set(
    (declaration?.specifiers ?? [])
      .filter((specifier) => specifier.type === "ImportSpecifier")
      .map((specifier) => specifier.imported.name),
  );
}

function newImportFix(fixer, lastDirective, importLine) {
  return lastDirective
    ? fixer.insertTextAfter(lastDirective, `\n${importLine}`)
    : fixer.insertTextBeforeRange([0, 0], `${importLine}\n`);
}

/**
 * An import injector for one module: reports which names are already imported
 * and produces the fixes that add the missing ones, extending an existing
 * import of the same module in place rather than adding a second declaration.
 */
export function importInjector(program, source, matches) {
  const declaration = program.body.find(
    (statement) =>
      statement.type === "ImportDeclaration" && matches(statement.source.value),
  );
  const imported = importedNames(declaration);
  const injected = new Set();
  const lastDirective = lastDirectiveOf(program);

  return (fixer, name) => {
    if (imported.has(name) || injected.has(name)) return [];
    injected.add(name);
    if (declaration) {
      const last = declaration.specifiers[declaration.specifiers.length - 1];
      return [fixer.insertTextAfter(last, `, ${name}`)];
    }
    const importLine = `import { ${name} } from "${source}";`;
    return [newImportFix(fixer, lastDirective, importLine)];
  };
}

/**
 * Where a helper lives RELATIVE to the file being fixed, when that file sits
 * inside `rootSegment` (a path fragment such as `libs/shared/src`): the fix
 * imports `<root>/<target>` by relative path. Null when the file is outside.
 */
export function relativeHelperPath(filename, rootSegment, target) {
  const unix = filename.replace(/\\/g, "/");
  const marker = `/${rootSegment.replace(/^\/+|\/+$/g, "")}/`;
  const idx = unix.indexOf(marker);
  if (idx === -1) return null;
  const srcRoot = unix.slice(0, idx + marker.length);
  const rel = path
    .relative(path.dirname(unix), `${srcRoot}${target}`)
    .replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export const ENFORCE_MODULE_SCHEMA = {
  type: "object",
  properties: {
    specifier: { type: "string" },
    sourceDir: { type: "string" },
  },
  required: ["specifier"],
  additionalProperties: false,
};

/**
 * Where the enforce helpers are imported from for one file, given the
 * `enforceModule` option: by relative path inside `sourceDir` (the package
 * that owns the helper, where a self-package import resolves to unbuilt dist),
 * the package `specifier` everywhere else.
 */
export function enforceSourceFor(filename, enforceModule) {
  const relative = enforceModule.sourceDir
    ? relativeHelperPath(filename, enforceModule.sourceDir, "lib/enforce.js")
    : null;
  return relative ?? enforceModule.specifier;
}
