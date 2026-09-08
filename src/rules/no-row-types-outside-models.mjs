/**
 * no-row-types-outside-models — a table's shape is declared once, in the models
 * directory.
 *
 * Before such a folder existed in the codebase this was extracted from, one row
 * was declared up to five times: in a port, in its DB adapter, in its in-memory
 * double, in a route, and again in the UI. Two of those copies had already
 * drifted to different spellings of the same key before anyone noticed. This
 * flags a NEW copy appearing outside the one home.
 *
 * The signal is a type whose members are predominantly snake_case — TypeScript
 * fields are camelCase by convention, so snake_case members mean the author was
 * transcribing columns.
 *
 * Options:
 *   - `modelsDir` (default `""`): a path segment such as `"libs/shared/src/models"`,
 *     matched against the forward-slash-normalised filename. Files under it are
 *     the destination, not the offence. Empty means nothing is exempt by
 *     directory.
 *   - `exemptNames` (default `[]`): type names to skip — for a wire type held to
 *     its model by a compile-time assertion rather than by being the model.
 *
 * What it deliberately does NOT flag, because each is legitimate and a rule that
 * cries wolf gets disabled rather than obeyed:
 *
 *   * anything under `modelsDir`;
 *   * fewer than {@link MIN_MEMBERS} members, which is a projection ("this read
 *     wants three columns"), not a table restatement;
 *   * tests and fixtures, which flatten columns they do not own on purpose;
 *     in-memory test doubles that do the same are exempted by the consumer with
 *     an `ignores:` glob;
 *   * an alias to ANOTHER type — `type X = components["schemas"]["Y"]` is exactly
 *     what this rule wants people to reach for. An alias to an object LITERAL
 *     (`type X = { full_name: string; … }`) is a declaration wearing a different
 *     keyword, and is treated as one.
 *
 * KNOWN LIMITATION: a shape from someone ELSE's API — GitHub's `default_branch`
 * and `html_url`, a vendor's usage blocks — is snake_case for their reasons, not
 * because a column was transcribed, and nothing structural separates the two. The
 * rule flags those, and the message names the case so a reader can dismiss it
 * without wondering whether the rule knows something they do not. Exempting by
 * filename would be a guess that rots the first time such a type moves.
 *
 * Detect-only. The fix is a judgement per type — model it, derive it, or keep it
 * as a projection — which is not a codemod.
 */

/** Files that legitimately transcribe columns they do not own. */
const EXEMPT_FILE = /(\.test\.ts|\.test\.tsx|\/fixtures\/)$/;

/**
 * Below this, a snake_case type is a projection rather than a table. Three is
 * the smallest shape that reads as "a row" rather than "the columns I asked
 * for"; `JobRunRecord { startedAt }` should never trip this.
 */
const MIN_MEMBERS = 3;

const isSnake = (name) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name);

function memberNames(body) {
  return body
    .filter((m) => m.type === "TSPropertySignature" && m.key)
    .map((m) => m.key.name ?? m.key.value)
    .filter((n) => typeof n === "string");
}

function underModelsDir(file, modelsDir) {
  const segment = modelsDir.replace(/^\/+|\/+$/g, "");

  return segment !== "" && file.includes(`/${segment}/`);
}

/** True when the file is the row types' home or a test that may flatten them. */
function exemptFile(filename, modelsDir) {
  const file = filename.replace(/\\/g, "/");

  return underModelsDir(file, modelsDir) || EXEMPT_FILE.test(file);
}

/** True when a declaration's members are predominantly snake_case. */
function looksLikeRow(members) {
  const snake = members.filter(isSnake).length;

  return members.length >= MIN_MEMBERS && snake * 2 > members.length;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "declare a table's shape once, in the models directory, instead of restating its columns",
    },
    schema: [
      {
        type: "object",
        properties: {
          modelsDir: {
            description:
              "Path segment of the directory where row types belong; files under it are exempt",
            type: "string",
          },
          exemptNames: {
            description: "Type names the rule never reports",
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rowTypeOutsideModels:
        '"{{name}}" restates a table\'s columns outside the models directory. Declare the table there once and derive this type from that declaration. If this is a projection rather than a row, keep it and name the columns it actually reads.',
    },
  },

  create(context) {
    const options = context.options?.[0] ?? {};
    const exemptNames = new Set(options.exemptNames ?? []);

    if (exemptFile(context.filename, options.modelsDir ?? "")) {
      return {};
    }

    function check(id, members) {
      const name = id?.name;

      if (name && !exemptNames.has(name) && looksLikeRow(members)) {
        context.report({
          node: id,
          messageId: "rowTypeOutsideModels",
          data: { name },
        });
      }
    }

    return {
      TSInterfaceDeclaration(node) {
        check(node.id, memberNames(node.body.body));
      },
      // `type X = { … }` is the same declaration with a different keyword. An
      // alias to any OTHER type is untouched, which is what keeps the generated
      // `components["schemas"][…]` alias — the thing this rule points people at
      // — from tripping it.
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation?.type === "TSTypeLiteral") {
          check(node.id, memberNames(node.typeAnnotation.members));
        }
      },
    };
  },
};
