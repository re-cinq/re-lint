/**
 * Every outbound `fetch` carries a signal, so it cannot hang forever.
 *
 * A `fetch` without one waits as long as the peer keeps the socket open, which in
 * practice is until something else times out — and in a single-threaded job loop
 * that means the loop, not the call. This is not hypothetical here: it froze
 * spec-trace ingestion once, which is why the Floor's event loop grew a
 * `SERIAL_DEADLINE_MS` guard (`apps/floor/src/main-loop/loop.ts`). The guard
 * bounds the damage; it does not stop the call from hanging.
 *
 * A one-time sweep would not hold — 50 sites were fixed, and the next `fetch`
 * anyone writes is the regression. So the invariant lives here instead of in a
 * commit message.
 *
 * `signal:` satisfies the rule, whatever produces it. `AbortSignal.timeout(ms)` is
 * the usual answer, but a caller-supplied signal is a deliberate decision about
 * who owns the deadline, and a rule that insisted on the literal form would push
 * people to re-derive a timeout they were handed.
 *
 * A spread (`{ ...opts }`) passes: the signal may well be inside, this rule cannot
 * see it, and guessing wrong in the noisy direction is how a rule gets disabled.
 *
 * Autofix, when the `timeoutMs` option is set: the missing signal is added as
 * `signal: AbortSignal.timeout(timeoutMs)` — to the options object when there is
 * one, as a new second argument when there is not. The deadline is the
 * consumer's policy, so with no `timeoutMs` the rule only reports. A call whose
 * options are not an object literal (`fetch(url, init)`) is reported unfixed:
 * the signal would have to go somewhere the rule cannot see. `AbortSignal.timeout`
 * needs Node 17.3+ or a current browser.
 *
 * The exception is a request MEANT to stay open — an SSE stream, a log tail. Those
 * disable the rule on the line, with a reason, so the intent is stated where the
 * call is rather than inferred by the next reader.
 */

function isSignalKey(key) {
  if (key?.type === "Identifier") {
    return key.name === "signal";
  }

  return key?.type === "Literal" && key.value === "signal";
}

function isUndefinedIdentifier(value) {
  return value?.type === "Identifier" && value.name === "undefined";
}

function mayCarrySignal(property) {
  if (property.type === "SpreadElement") {
    // Cannot see inside; treat as possibly carrying it rather than report.
    return true;
  }

  if (!isSignalKey(property.key)) {
    return false;
  }

  // `signal: undefined` is an absent deadline wearing the right key.
  return !isUndefinedIdentifier(property.value);
}

/** `signal: <anything but undefined>` among an options object's properties. */
function carriesSignal(options) {
  if (options?.type !== "ObjectExpression") {
    return false;
  }

  return options.properties.some(mayCarrySignal);
}

/** The bare global, not `client.fetch(...)` / `this.fetch(...)`. */
function isGlobalFetch(node) {
  return node.callee.type === "Identifier" && node.callee.name === "fetch";
}

function timeoutSignal(timeoutMs) {
  return `AbortSignal.timeout(${timeoutMs})`;
}

/** Appends `entryText` as the last entry before `closingToken`, keeping a trailing comma if there is one. */
function appendBefore(sourceCode, fixer, closingToken, entryText) {
  const last = sourceCode.getTokenBefore(closingToken);

  if (last.value === "{") {
    return fixer.insertTextAfter(last, ` ${entryText} `);
  }

  if (last.value === ",") {
    return fixer.insertTextAfter(last, ` ${entryText},`);
  }

  return fixer.insertTextAfter(last, `, ${entryText}`);
}

function hasOnlyPlainArguments(call) {
  return (
    call.arguments.length > 0 &&
    call.arguments.length <= 2 &&
    call.arguments.every((argument) => argument.type !== "SpreadElement")
  );
}

function addSignalArgument(sourceCode, call, signal) {
  return (fixer) =>
    appendBefore(
      sourceCode,
      fixer,
      sourceCode.getLastToken(call),
      `{ signal: ${signal} }`,
    );
}

function addSignalProperty(sourceCode, options, signal) {
  const absentSignal = options.properties.find((property) =>
    isSignalKey(property.key),
  );

  if (absentSignal) {
    return (fixer) => fixer.replaceText(absentSignal.value, signal);
  }

  return (fixer) =>
    appendBefore(
      sourceCode,
      fixer,
      sourceCode.getLastToken(options),
      `signal: ${signal}`,
    );
}

/** A fix that adds the signal, or undefined when no deadline is configured or the options are opaque. */
function signalFix(sourceCode, call, timeoutMs) {
  const [, options] = call.arguments;

  if (timeoutMs === undefined || !hasOnlyPlainArguments(call)) {
    return undefined;
  }

  if (!options) {
    return addSignalArgument(sourceCode, call, timeoutSignal(timeoutMs));
  }

  if (options.type !== "ObjectExpression") {
    return undefined;
  }

  return addSignalProperty(sourceCode, options, timeoutSignal(timeoutMs));
}

export default {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "require a signal on every outbound fetch so it cannot hang forever",
    },
    schema: [
      {
        type: "object",
        properties: { timeoutMs: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      noTimeout:
        "fetch has no signal and can hang forever — pass `signal: AbortSignal.timeout(ms)` (or a caller's signal). A request meant to stay open (SSE, log tail) disables this rule on the line with a reason.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const timeoutMs = context.options[0]?.timeoutMs;

    return {
      CallExpression(node) {
        if (!isGlobalFetch(node) || carriesSignal(node.arguments[1])) {
          return;
        }

        context.report({
          node,
          messageId: "noTimeout",
          fix: signalFix(sourceCode, node, timeoutMs),
        });
      },
    };
  },
};
