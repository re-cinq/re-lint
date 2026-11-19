/**
 * max-expects — one assertion per test. A test that checks five fields with
 * five `expect` calls stops at the first failure and hides the other four;
 * `expect(result).toEqual({...})` shows the whole diff at once, and a test
 * that genuinely needs two unrelated assertions is two tests.
 *
 * What counts: inside the callback of `it(...)` / `test(...)` and their
 * `.only` / `.skip` / `.each(...)` forms, every `expect(...)` call — the
 * ROOT call, so `expect(x).resolves.toEqual(y)` is one, not three.
 * `expect.assertions(n)` and `expect.hasAssertions()` are bookkeeping, not
 * assertions, and are not counted. Helper functions declared inside the test
 * body count toward the test that contains them: hiding assertions in a local
 * closure does not make the test smaller.
 *
 * Reported at the test call. Detect-only: which assertions merge into one
 * object and which become their own test is the author's call.
 */

import { isTestCall } from "./lib/test-calls.mjs";

function isExpectRootCall(node) {
  return node.callee.type === "Identifier" && node.callee.name === "expect";
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce a maximum number of expect calls per it/test callback (default 1)",
    },
    schema: [
      {
        type: "object",
        properties: {
          max: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyExpects:
        "Test has {{count}} expect calls (max {{max}}); assert one object with toEqual/toMatchObject or split the test",
    },
  },
  create(context) {
    const max = context.options[0]?.max ?? 1;
    const openTests = [];

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          openTests.push({ node, count: 0 });
          return;
        }
        if (isExpectRootCall(node) && openTests.length > 0) {
          openTests[openTests.length - 1].count += 1;
        }
      },
      "CallExpression:exit"(node) {
        if (!isTestCall(node)) {
          return;
        }
        const { count } = openTests.pop();
        if (count > max) {
          context.report({
            node,
            messageId: "tooManyExpects",
            data: { count, max },
          });
        }
      },
    };
  },
};
