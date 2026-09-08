/**
 * no-commented-out-code — a comment whose text is code. Dead code behind `//`
 * is neither documentation nor behaviour; it rots silently and misleads the
 * next reader into thinking it might still matter. Version control remembers
 * it, so delete it.
 *
 * What counts: a comment (or a run of consecutive `//` line comments, joined
 * into one candidate so a commented-out block is one report at its first
 * line) whose text contains at least one code-shaped character — `;`, `{`,
 * `}`, `=`, `(` — AND parses as a Program via espree, or via the TypeScript
 * parser when the file is `.ts`/`.tsx`/`.mts`/`.cts`. Prose that happens to
 * parse as a single bare identifier or literal (`// done`, `// 42`) is not
 * code: at least one statement must be something else.
 *
 * Always exempt: tooling directives and doc markers — `eslint-*`, `@ts-*`,
 * c8/v8/istanbul coverage hints, jscpd fences, prettier-ignore, `global`,
 * `jsx`, TODO/FIXME/NOTE markers, JSDoc `@tags`, and any block comment
 * starting with `*` (JSDoc).
 *
 * Detect-only: deleting is the fix, and only a human knows it is safe.
 */

import * as espree from "espree";
import { parse as parseTypeScript } from "@typescript-eslint/parser";

const CODE_SHAPED = /[;{}=(]/;
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;
const DIRECTIVE_PATTERN =
  /^\s*(eslint|@ts-|c8\s|v8\s|istanbul\s|jscpd|prettier|global\s|jsx\s|TODO|FIXME|NOTE|@[a-z])/i;

function isDirective(comment) {
  if (comment.type === "Shebang") {
    return true;
  }

  if (comment.type === "Block" && comment.value.startsWith("*")) {
    return true;
  }

  return DIRECTIVE_PATTERN.test(comment.value);
}

function continuesRun(run, comment) {
  const bothLineComments = comment.type === "Line" && run.first.type === "Line";

  return bothLineComments && comment.loc.start.line === run.endLine + 1;
}

function groupLineRuns(comments) {
  const runs = [];
  let run = null;

  for (const comment of comments) {
    if (run && continuesRun(run, comment)) {
      run.text += `\n${comment.value}`;
      run.endLine = comment.loc.end.line;

      continue;
    }

    run = {
      first: comment,
      text: comment.value,
      endLine: comment.loc.end.line,
    };
    runs.push(run);
  }

  return runs;
}

function isBareExpression(statement) {
  if (statement.type !== "ExpressionStatement") {
    return false;
  }

  return ["Identifier", "Literal"].includes(statement.expression.type);
}

function hasRealStatement(program) {
  return program.body.some((statement) => !isBareExpression(statement));
}

function parseWith(parser, text) {
  try {
    return parser(text);
  } catch {
    return null;
  }
}

const ESPREE_OPTIONS = { ecmaVersion: "latest", sourceType: "module" };

function parses(text, isTypeScript) {
  const program =
    parseWith((source) => espree.parse(source, ESPREE_OPTIONS), text) ??
    (isTypeScript ? parseWith(parseTypeScript, text) : null);

  return program !== null && hasRealStatement(program);
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow comments whose text is code; delete commented-out code, version control remembers it",
    },
    schema: [
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    ],
    messages: {
      commentedOutCode:
        "Commented-out code; delete it, version control remembers",
    },
  },
  create(context) {
    const isTypeScript = TYPESCRIPT_FILE.test(context.filename);

    return {
      Program() {
        const comments = context.sourceCode
          .getAllComments()
          .filter((comment) => !isDirective(comment));

        for (const run of groupLineRuns(comments)) {
          const isCode =
            CODE_SHAPED.test(run.text) && parses(run.text, isTypeScript);

          if (isCode) {
            context.report({ node: run.first, messageId: "commentedOutCode" });
          }
        }
      },
    };
  },
};
