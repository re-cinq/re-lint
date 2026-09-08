import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const snippetsDir = join(root, "test-fixtures", "readme");
const readme = readFileSync(join(root, "README.md"), "utf8");

const snippets = readdirSync(snippetsDir).filter((name) =>
  name.endsWith(".config.mjs"),
);

for (const name of snippets) {
  const source = readFileSync(join(snippetsDir, name), "utf8").trim();

  test(`README embeds test-fixtures/readme/${name} verbatim`, () => {
    assert.ok(readme.includes(source), `${name} is not in README.md`);
  });

  test(`test-fixtures/readme/${name} loads as a flat config`, async () => {
    const { default: config } = await import(
      pathToFileURL(join(snippetsDir, name)).href
    );
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: config,
    });
    const [result] = await eslint.lintText("export const answer = 42;\n", {
      filePath: "src/answer.ts",
    });

    assert.deepEqual(
      result.messages.filter((message) => message.fatal),
      [],
    );
  });
}
