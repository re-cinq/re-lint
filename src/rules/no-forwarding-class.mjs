/**
 * no-forwarding-class — a class whose EVERY method only forwards 1:1 to its
 * single constructor-injected port is indirection without behavior: pass the
 * port itself instead of wrapping it. (TODO-#7 rule: the `Usage` wrapper over
 * `UsagePort`.)
 *
 * Method-level check: a *forwarding method* has a body that is exactly
 * `return this.<dep>.<sameName>(<own params in order>);`. A *forwarding class*
 * has exactly one constructor whose whole parameter list is a single
 * parameter property (`private readonly <dep>: <Port>`), an empty constructor
 * body, at least one other member, and every member a forwarding method.
 * Partial forwarders (any real method, extra ctor params, ctor setup work)
 * are legitimate adapters/facades and are never flagged.
 *
 * Two report sites:
 *  - the class declaration (not fixable — deleting the class file is manual);
 *  - each `new X(port)` usage, resolved CROSS-FILE via the TypeScript checker.
 *    The usage fix replaces `new X(arg)` with `arg`, rewrites `X` type
 *    references in the file to the constructor's port type, and drops the
 *    now-dead import specifier. Type-reference rewrites only run when the port
 *    type name is already in scope — the fix never fabricates an import.
 *
 * Requires type information (parserServices); the rule is inert without it.
 */

import ts from "typescript";

function soleConstructor(classDeclaration) {
  const constructors = classDeclaration.members.filter(
    (member) => ts.isConstructorDeclaration(member) && member.body,
  );
  return constructors.length === 1 ? constructors[0] : null;
}

/** The lone typed parameter property of an empty-bodied constructor, else null. */
function injectedPortParameter(ctor) {
  if (ctor.body.statements.length > 0) return null;
  if (ctor.parameters.length !== 1) return null;
  const param = ctor.parameters[0];
  if (!ts.isParameterPropertyDeclaration(param, ctor)) return null;
  return ts.isIdentifier(param.name) && param.type ? param : null;
}

/** `{ depName, portTypeText }` when the ts.ClassDeclaration is a pure forwarder, else null. */
function forwardingShape(classDeclaration) {
  const ctor = soleConstructor(classDeclaration);
  if (!ctor) return null;
  const param = injectedPortParameter(ctor);
  if (!param) return null;
  const depName = param.name.text;

  const others = classDeclaration.members.filter((member) => member !== ctor);
  if (others.length === 0) return null;
  if (!others.every((member) => isForwardingMethod(member, depName))) {
    return null;
  }
  return { depName, portTypeText: param.type.getText() };
}

function isPlainParameter(parameter) {
  return (
    ts.isIdentifier(parameter.name) &&
    !parameter.initializer &&
    !parameter.dotDotDotToken
  );
}

function isInstanceMethodWithPlainParameters(member) {
  if (!ts.isMethodDeclaration(member) || !member.body) return false;
  if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) {
    return false;
  }
  if (!ts.isIdentifier(member.name)) return false;
  return member.parameters.every(isPlainParameter);
}

/** The call of a body that is exactly `return <call>;`, else null. */
function soleReturnedCall(body) {
  if (body.statements.length !== 1) return null;
  const statement = body.statements[0];
  if (!ts.isReturnStatement(statement) || !statement.expression) return null;
  const call = statement.expression;
  return ts.isCallExpression(call) ? call : null;
}

/** `call` is `this.<depName>.<methodName>(...)`. */
function callsInjectedPort(call, depName, methodName) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text !== methodName) return false;
  const receiver = callee.expression;
  if (!ts.isPropertyAccessExpression(receiver)) return false;
  return (
    receiver.expression.kind === ts.SyntaxKind.ThisKeyword &&
    receiver.name.text === depName
  );
}

function forwardsOwnParameters(call, parameters) {
  return (
    call.arguments.length === parameters.length &&
    call.arguments.every(
      (argument, i) =>
        ts.isIdentifier(argument) && argument.text === parameters[i].name.text,
    )
  );
}

/** Body is exactly `return this.<depName>.<ownName>(<own params in order>);`. */
function isForwardingMethod(member, depName) {
  if (!isInstanceMethodWithPlainParameters(member)) return false;
  const call = soleReturnedCall(member.body);
  if (!call) return false;
  if (!callsInjectedPort(call, depName, member.name.text)) return false;
  return forwardsOwnParameters(call, member.parameters);
}

function classDeclarationOf(symbol, checker) {
  const resolved =
    symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return resolved?.declarations?.find(ts.isClassDeclaration) ?? null;
}

function namesBroughtIntoScope(statement) {
  if (statement.type === "ImportDeclaration") {
    return statement.specifiers.map((specifier) => specifier.local.name);
  }
  return [statement, statement.declaration]
    .filter((node) => node?.id?.type === "Identifier")
    .map((node) => node.id.name);
}

/** All identifiers a file's top level brings into scope (imports + declarations). */
function topLevelNames(program) {
  return new Set(program.body.flatMap(namesBroughtIntoScope));
}

function isAstNode(value) {
  return Boolean(value) && typeof value.type === "string";
}

function childNodes(node) {
  return Object.keys(node)
    .filter((key) => key !== "parent")
    .flatMap((key) => {
      const value = node[key];
      return Array.isArray(value) ? value : [value];
    })
    .filter(isAstNode);
}

function isTypeReferenceTo(node, className) {
  return (
    node.type === "TSTypeReference" &&
    node.typeName.type === "Identifier" &&
    node.typeName.name === className
  );
}

function collectTypeReferences(node, className, acc = []) {
  if (!isAstNode(node)) return acc;
  if (isTypeReferenceTo(node, className)) acc.push(node);
  childNodes(node).forEach((child) =>
    collectTypeReferences(child, className, acc),
  );
  return acc;
}

/** The range to cut so the specifier and one adjoining comma go together. */
function specifierRemovalRange(specifiers, index) {
  const specifier = specifiers[index];
  if (index > 0) {
    return [specifiers[index - 1].range[1], specifier.range[1]];
  }
  return [specifier.range[0], specifiers[index + 1].range[0]];
}

function removeImportSpecifierFixes(fixer, program, className) {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const index = statement.specifiers.findIndex(
      (specifier) =>
        specifier.type === "ImportSpecifier" &&
        specifier.local.name === className,
    );
    if (index === -1) continue;
    if (statement.specifiers.length === 1) return [fixer.remove(statement)];
    return [
      fixer.removeRange(specifierRemovalRange(statement.specifiers, index)),
    ];
  }
  return [];
}

function isSingleArgumentNew(node) {
  if (node.callee.type !== "Identifier") return false;
  return (
    node.arguments.length === 1 && node.arguments[0].type !== "SpreadElement"
  );
}

function fileWideRewriteFixes({ fixer, sourceCode, className, portTypeText }) {
  const fixes = collectTypeReferences(sourceCode.ast, className).map(
    (reference) => fixer.replaceText(reference, portTypeText),
  );
  return fixes.concat(
    removeImportSpecifierFixes(fixer, sourceCode.ast, className),
  );
}

function forwardingShapeOfCallee(services, checker, callee) {
  const symbol = checker.getSymbolAtLocation(
    services.esTreeNodeToTSNodeMap.get(callee),
  );
  const declaration = classDeclarationOf(symbol, checker);
  return declaration ? forwardingShape(declaration) : null;
}

// File-wide cleanup rides on the first usage fix only, and only
// when the port type is already in scope — never fabricate imports.
function usageFix({ fixer, sourceCode, fixedClasses, node, shape }) {
  const className = node.callee.name;
  const fixes = [
    fixer.replaceText(node, sourceCode.getText(node.arguments[0])),
  ];
  if (fixedClasses.has(className)) return fixes;
  if (!topLevelNames(sourceCode.ast).has(shape.portTypeText)) return fixes;
  fixedClasses.add(className);
  return fixes.concat(
    fileWideRewriteFixes({
      fixer,
      sourceCode,
      className,
      portTypeText: shape.portTypeText,
    }),
  );
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "disallow classes that only forward 1:1 to their single injected port — pass the port itself",
    },
    fixable: "code",
    schema: [],
    messages: {
      forwardingClass:
        "Every method of this class only forwards 1:1 to the injected `{{dep}}` — pass the port itself instead of wrapping it.",
      forwardingUsage:
        "`{{name}}` only forwards to its injected port — hand out the {{port}} directly.",
    },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services?.program || !services?.esTreeNodeToTSNodeMap) return {};

    const checker = services.program.getTypeChecker();
    const sourceCode = context.sourceCode;
    const fixedClasses = new Set();

    return {
      ClassDeclaration(node) {
        const shape = forwardingShape(services.esTreeNodeToTSNodeMap.get(node));
        if (!shape) return;
        context.report({
          node: node.id ?? node,
          messageId: "forwardingClass",
          data: { dep: shape.depName },
        });
      },

      NewExpression(node) {
        if (!isSingleArgumentNew(node)) return;
        const shape = forwardingShapeOfCallee(services, checker, node.callee);
        if (!shape) return;
        context.report({
          node,
          messageId: "forwardingUsage",
          data: { name: node.callee.name, port: shape.portTypeText },
          fix: (fixer) =>
            usageFix({ fixer, sourceCode, fixedClasses, node, shape }),
        });
      },
    };
  },
};
