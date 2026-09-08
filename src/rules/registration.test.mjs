import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import plugin from "../index.mjs";

/**
 * A rule can stop running silently: its file exists but nothing exports it,
 * or it is exported but has no test. Neither fails anything on its own, so
 * the lists are held in agreement here.
 */

const here = dirname(fileURLToPath(import.meta.url));

const files = readdirSync(here)
  .filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"))
  .map((f) => f.replace(/\.mjs$/, ""))
  .sort();

const exported = Object.keys(plugin.rules).sort();

test("every rule file is exported from the plugin", () => {
  assert.deepEqual(files.filter((f) => !exported.includes(f)), []);
});

test("every exported rule has a file behind it", () => {
  assert.deepEqual(exported.filter((r) => !files.includes(r)), []);
});

test("every rule ships a RuleTester suite", () => {
  assert.deepEqual(
    files.filter((f) => !existsSync(join(here, `${f}.test.mjs`))),
    [],
  );
});

test("every rule declares meta.docs.description and a schema", () => {
  const missing = exported.filter((name) => {
    const { meta } = plugin.rules[name];
    return !meta?.docs?.description || !("schema" in meta);
  });
  assert.deepEqual(missing, []);
});
