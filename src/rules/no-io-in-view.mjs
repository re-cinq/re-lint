/**
 * no-io-in-view — the "data down" half of DDAU (data-down/actions-up). A view
 * (presentational) component presents data it receives as props; it must not
 * reach the outside world. Containers (`page.tsx`, `layout.tsx`, `*Panel.tsx`,
 * `actions.ts`, api routes) own the IO and pass the result down. This flags,
 * inside a view-suffixed file:
 *   - imports of a configured data module or a server-action module (specifier
 *     ending in `actions`) — static, dynamic `import()`, `require()`
 *   - network globals: `fetch`, `new WebSocket/EventSource/XMLHttpRequest`,
 *     `navigator.sendBeacon`
 *
 * Options:
 *   - `viewSuffixes` (default `["View","Card","Table","Section","Badge","Row"]`):
 *     a file is a view when its basename is `<name><Suffix>.tsx`.
 *   - `dataModules` (default `[]`): exact import specifiers of the data layer
 *     (`"@/lib/db"`, `"@/lib/github"`, …). When the list is EMPTY the rule
 *     reports nothing at all — a consumer opts in by naming its data layer, so
 *     an unconfigured rule never surprises anyone.
 *
 * No path gate of its own beyond the suffix: the consumer scopes it to its UI
 * source with a `files:` glob. Test files are skipped.
 *
 * A denylist of the known exterior-world channels, not an allowlist: views
 * legitimately import components, types, CSS modules, and pure helpers, so
 * banning specific IO channels is what keeps false positives out.
 *
 * Detect-only: the fix is lifting the IO into the right container and threading
 * a prop — which container + what prop shape needs a human, not a codemod.
 */

const DEFAULT_VIEW_SUFFIXES = [
  "View",
  "Card",
  "Table",
  "Section",
  "Badge",
  "Row",
];
const XHR_CONSTRUCTORS = new Set([
  "WebSocket",
  "EventSource",
  "XMLHttpRequest",
]);
const GLOBAL_HOSTS = new Set(["window", "globalThis", "self"]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function viewName(filename, suffixes) {
  const path = filename.replace(/\\/g, "/");
  const base = path.slice(path.lastIndexOf("/") + 1);

  if (base.includes(".test.")) {
    return null;
  }

  const suffixPattern = new RegExp(
    `(?:${suffixes.map(escapeRegExp).join("|")})\\.tsx$`,
  );

  if (!suffixPattern.test(base)) {
    return null;
  }

  return base.slice(0, -".tsx".length);
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow reaching the outside world (data layer, server actions, network globals) in presentational components — fetch in the container and pass props down (DDAU)",
    },
    schema: [
      {
        type: "object",
        properties: {
          viewSuffixes: {
            description:
              "Basename suffixes that mark a file as a presentational view (<name><Suffix>.tsx)",
            type: "array",
            items: { type: "string" },
          },
          dataModules: {
            description:
              "Exact import specifiers of the data layer; when empty the rule reports nothing",
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      ioImportInView:
        "Presentational component '{{name}}' must not reach the outside world — it imports '{{source}}'. Fetch in the container and pass the result down as props (data down, actions up).",
      networkCallInView:
        "Presentational component '{{name}}' must not reach the outside world — it calls '{{api}}'. Move the network call into a container and pass the result down as props (data down, actions up).",
    },
  },

  create(context) {
    const options = context.options?.[0] ?? {};
    const dataModules = new Set(options.dataModules ?? []);

    if (dataModules.size === 0) {
      return {};
    }

    const name = viewName(
      context.filename,
      options.viewSuffixes ?? DEFAULT_VIEW_SUFFIXES,
    );

    if (!name) {
      return {};
    }

    function bannedSource(value) {
      if (typeof value !== "string") {
        return null;
      }

      if (dataModules.has(value)) {
        return value;
      }

      // Server-action modules — the final path segment is `actions`. Actions flow
      // down as props; a view importing them is doing the container's job.
      if (/(?:^|\/)actions$/.test(value)) {
        return value;
      }

      return null;
    }

    function reportImport(node, value) {
      const source = bannedSource(value);
      if (source) {
        context.report({
          node,
          messageId: "ioImportInView",
          data: { name, source },
        });
      }
    }

    function reportNetwork(node, api) {
      context.report({
        node,
        messageId: "networkCallInView",
        data: { name, api },
      });
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        reportImport(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") {
          reportImport(node, node.source.value);
        }
      },
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          XHR_CONSTRUCTORS.has(node.callee.name)
        ) {
          reportNetwork(node, `new ${node.callee.name}`);
        }
      },
      CallExpression(node) {
        const callee = node.callee;

        if (
          callee.type === "Identifier" &&
          callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal"
        ) {
          reportImport(node, node.arguments[0].value);

          return;
        }

        if (callee.type === "Identifier" && callee.name === "fetch") {
          reportNetwork(node, "fetch");

          return;
        }

        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ) {
          const host =
            callee.object.type === "Identifier" ? callee.object.name : null;

          if (callee.property.name === "fetch" && GLOBAL_HOSTS.has(host)) {
            reportNetwork(node, "fetch");

            return;
          }

          if (callee.property.name === "sendBeacon" && host === "navigator") {
            reportNetwork(node, "navigator.sendBeacon");
          }
        }
      },
    };
  },
};
