/**
 * no-cross-layer-import — enforces the layering declared in `layers.yaml` at the
 * repo root. A folder may import only what its entry lists, so the architecture
 * is a file someone can read rather than a habit that erodes.
 *
 * layers.yaml maps a package directory to its folders, each folder to the
 * folders it may import:
 *
 *   apps/floor:
 *     ".":       [kernel, jobs, delivery]
 *     kernel:    []
 *     jobs/lib:  [kernel, "@re-cinq/lore-shared"]
 *     jobs/*:    [kernel, jobs/lib, "@re-cinq/lore-shared"]
 *
 * Four rules, and no others:
 *  1. A key names a LAYER — the folder it names and everything under it;
 *     `*` matches one segment, so `jobs/*` makes each domain its own layer.
 *  2. Movement inside a layer is free; the list only governs what LEAVES it.
 *  3. A layer may import what its list names, and nothing else.
 *  4. The most specific matching key wins, so `jobs/lib` beats `jobs/*`.
 *
 * Sibling isolation needs no syntax: `jobs/*` listing `kernel` lets
 * `jobs/review` reach kernel and itself, and `jobs/merge` is simply not on the
 * list. A package ABSENT from layers.yaml is not checked at all, so this lands
 * one package at a time; inside a package that IS listed, a folder with no
 * entry may import nothing, which is what keeps the file honest as code grows.
 *
 * npm and node: specifiers are never governed — package.json already owns that.
 * Cross-package specifiers under a scope named in the `firstPartyScopes` option
 * (default `[]`, e.g. `["@re-cinq"]`) are, written verbatim in a list.
 *
 * An entry may be a plain list, or `{ imports: [...], tests: [...] }` where
 * `tests` names what a *.test.ts file in that layer may ALSO import. A route
 * test that boots the server it mounts into needs the composition root; the
 * route itself must not, and one list cannot say both.
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { validateLayersConfig } from "./lib/layers-config.mjs";

const CONFIG_FILE = "layers.yaml";
const cache = new Map();

/** The nearest ancestor directory holding layers.yaml, or null. */
function findConfigDir(from) {
  let dir = from;

  for (;;) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function loadConfig(from) {
  const dir = findConfigDir(from);
  if (!dir) return null;
  const cached = cache.get(dir);
  if (cached) return cached;
  const parsed = validateLayersConfig(
    parse(fs.readFileSync(path.join(dir, CONFIG_FILE), "utf8")),
    CONFIG_FILE,
  );
  const loaded = {
    root: dir,
    layers: parsed.layers ?? {},
    aliases: parsed.aliases ?? {},
  };
  cache.set(dir, loaded);

  return loaded;
}

/** The `src`-relative folder of a file inside a governed package, else null. */
function folderIn(pkg, relFile) {
  const prefix = `${pkg}/src/`;
  if (!relFile.startsWith(prefix)) return null;
  const rest = relFile.slice(prefix.length);
  const dir = path.posix.dirname(rest);

  return dir === "." ? "." : dir;
}

/** A key governs the folder it names AND everything under it, so a nested
 * folder inherits its parent's entry instead of falling through to "unlisted". */
function segmentsMatch(keySegs, folderSegs) {
  if (keySegs.length > folderSegs.length) return false;

  return keySegs.every((seg, i) => seg === "*" || seg === folderSegs[i]);
}

/** The most specific key matching this folder: longest, then fewest stars. */
function keyFor(entries, folder) {
  const folderSegs = folder === "." ? [] : folder.split("/");
  const matches = Object.keys(entries).filter((key) => {
    if (key === ".") return folder === ".";

    return segmentsMatch(key.split("/"), folderSegs);
  });

  return matches.sort((a, b) => {
    const segs = b.split("/").length - a.split("/").length;
    if (segs !== 0) return segs;

    return starCount(a) - starCount(b);
  })[0];
}

function starCount(key) {
  return key.split("/").filter((seg) => seg === "*").length;
}

/** The layer a key names for this folder, with each `*` bound to the real segment. */
function layerRoot(key, folder) {
  if (key === ".") return ".";
  const folderSegs = folder.split("/");

  return key
    .split("/")
    .map((seg, i) => (seg === "*" ? folderSegs[i] : seg))
    .join("/");
}

/** True when `target` is `base` or sits underneath it. */
function isWithin(target, base) {
  if (base === ".") return true;

  return target === base || target.startsWith(`${base}/`);
}

const TEST_FILE = /\.test\.(?:tsx?|mjs)$/;
const UNLISTED_FOLDER = "unlistedFolder";
const NOT_ALLOWED = "notAllowed";

function inlineConfig(options) {
  if (!options.layers) return null;

  return {
    root: options.root ?? process.cwd(),
    layers: options.layers,
    aliases: options.aliases ?? {},
  };
}

function firstPartyMatcher(scopes = []) {
  return (spec) =>
    scopes.some((scope) =>
      spec.startsWith(scope.endsWith("/") ? scope : `${scope}/`),
    );
}

function isStringLiteral(node) {
  return node.type === "Literal" && typeof node.value === "string";
}

function repoRelative(root, filename) {
  return path
    .relative(root, path.resolve(root, filename))
    .split(path.sep)
    .join("/");
}

function packageOf(layers, relFile) {
  return Object.keys(layers).find((pkg) => relFile.startsWith(`${pkg}/src/`));
}

function allowedImports(entry, isTest) {
  if (Array.isArray(entry)) return entry;
  const forTests = isTest ? (entry.tests ?? []) : [];

  return [...(entry.imports ?? []), ...forTests];
}

function permissions(entries, key, folder, isTest) {
  if (key === undefined) return { allowed: null, layer: null };

  return {
    allowed: allowedImports(entries[key], isTest),
    layer: layerRoot(key, folder),
  };
}

/** What the linted file may import, or null when its package is not governed. */
function scopeFor(config, filename) {
  const relFile = repoRelative(config.root, filename);
  const pkg = packageOf(config.layers, relFile);
  if (!pkg) return null;
  const folder = folderIn(pkg, relFile);
  const entries = config.layers[pkg];
  const key = keyFor(entries, folder);

  return {
    relFile,
    pkg,
    folder,
    aliases: config.aliases[pkg] ?? {},
    ...permissions(entries, key, folder, TEST_FILE.test(relFile)),
  };
}

// `join`, never `resolve`: resolve() with a relative base silently prepends
// process.cwd(), so linting from a subdirectory resolved every target
// outside the package and reported nothing at all.
function targetFolder(scope, spec) {
  const rel = path.posix.normalize(
    path.posix.join(path.posix.dirname(scope.relFile), spec),
  );

  return folderIn(scope.pkg, rel.replace(/\.(js|ts|tsx)$/, ".ts"));
}

// A package can import through a tsconfig alias (web-ui's `@/`), and an
// alias the rule cannot see leaves a whole package silently unchecked.
function underAlias(scope, spec) {
  const alias = Object.entries(scope.aliases).find(([prefix]) =>
    spec.startsWith(prefix),
  );
  if (!alias) return undefined;
  const [prefix, target] = alias;
  const rest = spec.slice(prefix.length);
  const joined = target ? `${target}/${rest}` : rest;

  return folderIn(scope.pkg, `${scope.pkg}/src/${joined}.ts`);
}

/** The governed folder a specifier lands in, or null when the rule does not govern it. */
function resolveTarget(scope, spec, isFirstParty) {
  const aliased = underAlias(scope, spec);
  if (aliased !== undefined) return { target: aliased, external: false };
  if (isFirstParty(spec)) {
    return { target: spec.split("/").slice(0, 2).join("/"), external: true };
  }
  if (!spec.startsWith(".")) return null;

  return { target: targetFolder(scope, spec), external: false };
}

function inLayer(layer, target) {
  if (layer === ".") return target === ".";

  return isWithin(target, layer);
}

function isPermitted(scope, { target, external }) {
  if (!external && inLayer(scope.layer, target)) return true;

  return scope.allowed.some((entry) => isWithin(target, entry));
}

function violation(scope, resolved) {
  if (scope.allowed === null) return UNLISTED_FOLDER;
  if (resolved.target === null || resolved.target === undefined) return null;

  return isPermitted(scope, resolved) ? null : NOT_ALLOWED;
}

function reportData(scope, messageId, target) {
  if (messageId === UNLISTED_FOLDER) return { folder: scope.folder };

  return {
    folder: scope.layer,
    target,
    allowed: scope.allowed.length ? scope.allowed.join(", ") : "nothing",
  };
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "enforce the folder layering declared in layers.yaml — a folder imports only what its entry lists",
    },
    schema: [
      {
        type: "object",
        properties: {
          layers: { type: "object" },
          aliases: { type: "object" },
          root: { type: "string" },
          firstPartyScopes: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    // Computed keys: the ids are pinned by the tests, and a literal `notAllowed`
    // key reads as a negated declaration to no-negative-names.
    messages: {
      [NOT_ALLOWED]:
        "`{{folder}}` may not import `{{target}}`. Its layers.yaml entry allows: {{allowed}}.",
      [UNLISTED_FOLDER]:
        "`{{folder}}` has no entry in layers.yaml, so it may import nothing. Give it one, or move the code into a folder that has one.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const options = context.options[0] ?? {};
    const isFirstParty = firstPartyMatcher(options.firstPartyScopes);
    const config =
      inlineConfig(options) ?? loadConfig(path.dirname(path.resolve(filename)));
    if (!config) return {};
    const scope = scopeFor(config, filename);
    if (!scope) return {};

    function check(node, spec) {
      const resolved = resolveTarget(scope, spec, isFirstParty);
      if (!resolved) return;
      const messageId = violation(scope, resolved);
      if (!messageId) return;
      context.report({
        node,
        messageId,
        data: reportData(scope, messageId, resolved.target),
      });
    }

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) =>
        node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) =>
        isStringLiteral(node.source) && check(node, node.source.value),
    };
  },
};
