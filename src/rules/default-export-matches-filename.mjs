/**
 * A default export must be findable by its own name.
 *
 * Meant for Next.js app directories. `export default async function NewFeature`
 * lived in `new/page.tsx`: grepping `NewFeature` found nothing, because every
 * page file in the app is called `page.tsx`. So a non-reserved file's default
 * export is named after its file, and a reserved Next filename re-exports one
 * that is.
 *
 * No path gate of its own: the consumer scopes it to its app source with a
 * `files:` glob. Test files and `.d.ts` declarations are skipped since neither
 * is a component module. Option `reserved: "off"` silences the reserved-file
 * checks during a staged migration.
 *
 * Route-segment config (`dynamic`, `revalidate`, `metadata`, …) is allowed to stay
 * in the reserved file: it MUST be declared literally there, since a re-exported
 * `export const dynamic` is not reliably picked up by Next's build-time analysis.
 *
 * Detect-only. A rename is a file move, not a codemod.
 */

/** Route files that render a COMPONENT. Their name is fixed by the framework, so
 *  the component must live in a file named after itself and be re-exported here. */
const PAGE_LIKE = new Set([
  "page",
  "layout",
  "error",
  "loading",
  "not-found",
  "template",
  "default",
  "global-error",
]);

/** Framework entry points whose default export is deliberately not a named
 *  component — `middleware.ts` default-exports `withAuth({...})`, an image file
 *  exports a generator. There is no name to make findable, so the rule skips them
 *  rather than demanding a re-export that would make no sense. */
const FRAMEWORK_ENTRY = new Set([
  "route",
  "middleware",
  "instrumentation",
  "sitemap",
  "robots",
  "manifest",
  "opengraph-image",
  "twitter-image",
  "icon",
  "apple-icon",
]);

/** Exports Next reads off the route module itself. */
const SEGMENT_CONFIG = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "experimental_ppr",
  "metadata",
  "generateMetadata",
  "viewport",
  "generateViewport",
  "generateStaticParams",
  "alt",
  "size",
  "contentType",
]);

/** Statement kinds a reserved file may always keep alongside its re-export. */
const RESIDUE_ALWAYS_ALLOWED = new Set([
  "ImportDeclaration",
  "ExportAllDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
]);

function declaredName(declaration) {
  return declaration.id?.name ?? null;
}

// memo(Foo) / forwardRef(Foo) still name the component.
function wrappedComponentName(call) {
  const named = call.arguments.find((arg) => arg.type === "Identifier");

  return named?.name ?? null;
}

const EXPORTED_NAME_BY_TYPE = {
  Identifier: (declaration) => declaration.name,
  FunctionDeclaration: declaredName,
  ClassDeclaration: declaredName,
  CallExpression: wrappedComponentName,
};

/** The name a default export declares, or null when it declares none. */
function exportedName(declaration) {
  const nameOf = EXPORTED_NAME_BY_TYPE[declaration?.type];

  return nameOf ? nameOf(declaration) : null;
}

function isSegmentConfigBinding(declarator) {
  return (
    declarator.id.type === "Identifier" &&
    SEGMENT_CONFIG.has(declarator.id.name)
  );
}

function isSegmentConfigDeclaration(declared) {
  if (declared.type === "FunctionDeclaration") {
    return declared.id ? SEGMENT_CONFIG.has(declared.id.name) : false;
  }

  if (declared.type === "VariableDeclaration") {
    return declared.declarations.every(isSegmentConfigBinding);
  }

  return false;
}

/** Statements a reserved file may keep alongside its re-export. */
function isAllowedResidue(node) {
  if (RESIDUE_ALWAYS_ALLOWED.has(node.type)) {
    return true;
  }

  if (node.type !== "ExportNamedDeclaration") {
    return false;
  }

  if (node.source || !node.declaration) {
    return true;
  }

  return isSegmentConfigDeclaration(node.declaration);
}

function isResidue(node) {
  return !isAllowedResidue(node);
}

function firstDeclaratorLabel(node) {
  const first = node.declarations[0]?.id;

  return first?.type === "Identifier" ? first.name : "a value";
}

/** A human-readable label for the statement that does not belong. */
function statementLabel(node) {
  if (node.type === "FunctionDeclaration" && node.id) {
    return node.id.name;
  }

  if (node.type === "VariableDeclaration") {
    return firstDeclaratorLabel(node);
  }

  return "other code";
}

function findDefaultExport(program) {
  return program.body.find(
    (statement) => statement.type === "ExportDefaultDeclaration",
  );
}

function reexportsDefault(statement) {
  return (
    statement.type === "ExportNamedDeclaration" &&
    statement.source &&
    statement.specifiers.some(
      (specifier) => specifier.exported.name === "default",
    )
  );
}

function checkReservedFile(context, program, file) {
  const defaultDecl = findDefaultExport(program);

  if (defaultDecl) {
    context.report({
      node: defaultDecl,
      messageId: "reservedInlineDefault",
      data: { file },
    });

    return;
  }

  if (!program.body.some(reexportsDefault)) {
    return;
  }

  for (const statement of program.body.filter(isResidue)) {
    context.report({
      node: statement,
      messageId: "reservedNotPureReexport",
      data: { file, name: statementLabel(statement) },
    });
  }
}

function checkNamedDefault(context, program, { file, stem }) {
  const defaultDecl = findDefaultExport(program);

  if (!defaultDecl) {
    return;
  }
  const name = exportedName(defaultDecl.declaration);

  if (name === null) {
    context.report({
      node: defaultDecl,
      messageId: "unnamedDefault",
      data: { file, stem },
    });

    return;
  }

  if (name !== stem) {
    context.report({
      node: defaultDecl.declaration.id ?? defaultDecl,
      messageId: "nameMismatch",
      data: { file, name },
    });
  }
}

function isSkippedFile(filename) {
  return filename.includes(".test.") || filename.endsWith(".d.ts");
}

function reservedMode(context) {
  return context.options?.[0]?.reserved ?? "error";
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "a default export's name matches its filename, so the component can be found by grepping its name",
    },
    schema: [
      {
        type: "object",
        properties: {
          reserved: {
            description:
              "Whether Next.js reserved route files (page, layout, ...) must be pure re-exports",
            enum: ["error", "off"],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      nameMismatch:
        '{{file}} default-exports "{{name}}". Rename one of the two so grepping "{{name}}" finds this file.',
      unnamedDefault:
        "{{file}} default-exports something unnamed — name it {{stem}} so the file can be found by its component's name.",
      reservedInlineDefault:
        "{{file}} must re-export its component from a file named after it, not declare it inline — every route file shares this name, so the component is unfindable.",
      reservedNotPureReexport:
        "{{file}} re-exports its default but also declares {{name}}. Keep only imports, the re-export, and route-segment config here.",
    },
  },

  create(context) {
    const filename = (context.filename ?? "").split("\\").join("/");

    if (isSkippedFile(filename)) {
      return {};
    }
    const file = filename.slice(filename.lastIndexOf("/") + 1);
    const stem = file.replace(/\.(tsx|ts|jsx|js)$/, "");

    if (FRAMEWORK_ENTRY.has(stem)) {
      return {};
    }

    if (PAGE_LIKE.has(stem)) {
      return reservedMode(context) === "off"
        ? {}
        : { Program: (program) => checkReservedFile(context, program, file) };
    }

    return {
      Program: (program) => checkNamedDefault(context, program, { file, stem }),
    };
  },
};
