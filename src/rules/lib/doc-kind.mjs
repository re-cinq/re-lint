/**
 * doc-kind — which corpus a markdown file belongs to.
 *
 * Shared by the three markdown rules (`require-statement-links`,
 * `require-intro-paragraph`, `require-status-matches-coverage`), each of which
 * gates on it and then hands the kind to a spec-vs-ADR aware parser. Every one
 * of them takes a `roots` option of this shape and passes it through.
 */

export const DEFAULT_DOC_ROOTS = { spec: ["specs"], adr: ["adrs"] };

const ROOTS_SCHEMA_LIST = { type: "array", items: { type: "string" } };

/** The `roots` option schema each markdown rule exposes. */
export const DOC_ROOTS_SCHEMA = {
  type: "object",
  properties: { spec: ROOTS_SCHEMA_LIST, adr: ROOTS_SCHEMA_LIST },
  additionalProperties: false,
};

/** True when `posix` has `root` as a directory segment, at any depth. */
function underRoot(posix, root) {
  const trimmed = root.replace(/^\/+|\/+$/g, "");

  return posix.includes(`/${trimmed}/`) || posix.startsWith(`${trimmed}/`);
}

/**
 * spec.md lives under one of `roots.spec`, ADRs under one of `roots.adr`;
 * anything else is out of scope. ADR wins when both match, so an ADR folder
 * nested inside a spec folder is still an ADR.
 */
export function docKind(filename, roots = DEFAULT_DOC_ROOTS) {
  const posix = filename.split("\\").join("/");
  const adrRoots = roots.adr ?? DEFAULT_DOC_ROOTS.adr;
  const specRoots = roots.spec ?? DEFAULT_DOC_ROOTS.spec;

  if (adrRoots.some((root) => underRoot(posix, root))) {
    return "adr";
  }

  if (specRoots.some((root) => underRoot(posix, root))) {
    return "spec";
  }

  return null;
}
