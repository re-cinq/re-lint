import { RuleTester } from "eslint";
import markdown from "@eslint/markdown";
import rule from "./no-ungrounded-spec-name.mjs";

const ruleTester = new RuleTester({
  plugins: { markdown },
  language: "markdown/gfm",
});

const SPEC = "specs/x/spec.md";
const REAL = "src/index.mjs";
const GONE = "libs/assembly-lines/src/transition.ts";
const DRAFT = ["| Status | Draft |", ""].join("\n");

function spec(body) {
  return [DRAFT, "## Requirements", "", body, ""].join("\n");
}

ruleTester.run("no-ungrounded-spec-name", rule, {
  valid: [
    {
      name: "a path this repository has",
      code: spec(`- **FR1**: The rule lives in \`${REAL}\`.`),
      filename: SPEC,
    },
    {
      name: "a path the statement says this change adds",
      code: spec(`- **FR1**: This change adds \`${GONE}\`.`),
      filename: SPEC,
    },
    {
      name: "a path a files-touched list names",
      code: spec(`## Files touched\n\n- \`${GONE}\` — new`),
      filename: SPEC,
    },
    {
      name: "prose that names no path at all",
      code: spec("- **FR1**: The line keys its runs on one subject."),
      filename: SPEC,
    },
    {
      name: "a retired doc is left alone, whatever it still names",
      code: [
        "| Status | Retired |",
        "",
        "## Requirements",
        "",
        `- **FR1**: Walk it in \`apps/floor\`.`,
        "",
      ].join("\n"),
      filename: SPEC,
    },
    {
      name: "a markdown file outside the spec and ADR roots",
      code: spec(`- **FR1**: Walk it in \`${GONE}\`.`),
      filename: "docs/notes.md",
    },
  ],
  invalid: [
    {
      name: "a path this repository does not have",
      code: spec(`- **FR1**: Edge selection in \`${GONE}\`.`),
      filename: SPEC,
      errors: [{ messageId: "missing", data: { name: GONE } }],
    },
    {
      name: "a retired component, reported with the hint that says what took its work",
      code: spec("- **FR1**: Map the task type in `apps/floor`."),
      filename: SPEC,
      errors: [{ messageId: "retired" }],
    },
    {
      name: "a path written without backticks, as a plan quote loses them",
      code: spec(`- **FR1**: Edge selection in ${GONE} decides the route.`),
      filename: SPEC,
      errors: 1,
    },
    {
      name: "an ADR names a path that is gone",
      code: [
        "---",
        "status: accepted",
        "---",
        "",
        `Stored by \`${GONE}\`.`,
        "",
      ].join("\n"),
      filename: "adrs/ADR-001-x.md",
      errors: 1,
    },
  ],
});
