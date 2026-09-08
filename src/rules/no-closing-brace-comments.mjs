/**
 * no-closing-brace-comments — a comment sitting after a closing `}` or `)` on
 * the same line (`} // end if`, `}) // end describe`). Such a marker exists
 * because the block it closes is too long to see whole; the fix is a block
 * short enough to read, not a signpost at its far end.
 *
 * What counts: a comment whose preceding token is a `}` or `)` punctuator
 * (optionally followed by the statement's `;`) ending on the comment's own
 * line, where the node that token closes started on an earlier line — a
 * marker after a one-line `work(); // called once` explains the call, not
 * the block. The token before a comment is found with
 * `sourceCode.getTokenBefore(comment)`; a comment on its own line, or one
 * following any other token (`return; // why`), is not this rule's business.
 *
 * Always exempt: `eslint-*` directive comments — a `} // eslint-disable-line`
 * is an instruction to the linter, not a marker for the reader.
 *
 * Detect-only: shortening the block is judgment.
 */

const CLOSING_PUNCTUATORS = new Set(["}", ")"]);
const ESLINT_DIRECTIVE = /^\s*eslint/;

function isClosingToken(token) {
  return token?.type === "Punctuator" && CLOSING_PUNCTUATORS.has(token.value);
}

function isSemicolon(token) {
  return token?.type === "Punctuator" && token.value === ";";
}

function closingTokenBefore(sourceCode, comment) {
  const tokenBefore = sourceCode.getTokenBefore(comment);

  if (isSemicolon(tokenBefore)) {
    return sourceCode.getTokenBefore(tokenBefore);
  }

  return tokenBefore;
}

function closesMultiLineNode(sourceCode, closingToken) {
  const closed = sourceCode.getNodeByRangeIndex(closingToken.range[0]);

  return closed !== null && closed.loc.start.line < closingToken.loc.end.line;
}

function isClosingBraceComment(sourceCode, comment) {
  if (ESLINT_DIRECTIVE.test(comment.value)) {
    return false;
  }

  const closingToken = closingTokenBefore(sourceCode, comment);

  return (
    isClosingToken(closingToken) &&
    closingToken.loc.end.line === comment.loc.start.line &&
    closesMultiLineNode(sourceCode, closingToken)
  );
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow a comment after a closing brace or paren on the same line; a block short enough to read needs no marker",
    },
    schema: [
      {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    ],
    messages: {
      closingBraceComment:
        "Closing-brace comment; a block short enough to read needs no marker",
    },
  },
  create(context) {
    const { sourceCode } = context;

    return {
      Program() {
        const flagged = sourceCode
          .getAllComments()
          .filter((comment) => isClosingBraceComment(sourceCode, comment));

        for (const comment of flagged) {
          context.report({ node: comment, messageId: "closingBraceComment" });
        }
      },
    };
  },
};
