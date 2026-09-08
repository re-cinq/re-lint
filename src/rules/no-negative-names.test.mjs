import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-negative-names.mjs";

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

ruleTester.run("no-negative-names", rule, {
  valid: [
    `const isReady = true; if (!isReady) { wait(); }`,
    `function enableSync(showMenu, allowRetry) { return showMenu && allowRetry; }`,
    // "not"/"no" inside a word is not a negation prefix
    `const notes = []; const noteCount = notes.length; const knot = 1;`,
    // un/skip/omit/exclude name operations, not negated state
    `const unlink = () => {}; const skipCount = 2; const omitKeys = []; const excludePaths = [];`,
    // only declarations are checked — references to foreign names are fine
    `if (!options.isNotReady) { notFound(); } hideMenu();`,
    // class names are out of scope: error classes are conventionally negative
    `class NotFoundError extends Error {}`,
    // destructuring takes its names from the source object
    `const { notFound, hideMenu } = response;`,
    `interface Flags { isReady: boolean; visibleFields: string[]; }`,
    {
      code: `const isNotReady = true; function disableSync() {}`,
      options: [{ allow: ["isNotReady", "disableSync"] }],
    },
  ],
  invalid: [
    {
      code: `const isNotReady = true;`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "isNotReady", suggestion: "isReady" },
        },
      ],
    },
    {
      code: `let notFound = false;`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "notFound", suggestion: "found" },
        },
      ],
    },
    {
      code: `function disableSync(hideMenu, preventRetry = false) {}`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "disableSync", suggestion: "enableSync" },
        },
        {
          messageId: "negativeName",
          data: { name: "hideMenu", suggestion: "showMenu" },
        },
        {
          messageId: "negativeName",
          data: { name: "preventRetry", suggestion: "allowRetry" },
        },
      ],
    },
    {
      code: `const check = (hasNoItems) => hasNoItems;`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "hasNoItems", suggestion: "hasItems" },
        },
      ],
    },
    {
      code: `class Menu { hiddenItems = []; shouldNotRender() { return false; } }`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "hiddenItems", suggestion: "visibleItems" },
        },
        {
          messageId: "negativeName",
          data: { name: "shouldNotRender", suggestion: "shouldRender" },
        },
      ],
    },
    {
      code: `const flags = { disabledSteps: [], canNotEdit: true };`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "disabledSteps", suggestion: "enabledSteps" },
        },
        {
          messageId: "negativeName",
          data: { name: "canNotEdit", suggestion: "canEdit" },
        },
      ],
    },
    {
      code: `interface Flags { isNotReady: boolean; }`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "isNotReady", suggestion: "isReady" },
        },
      ],
    },
    {
      code: `class Svc { constructor(private readonly disableCache: boolean) {} }`,
      errors: [
        {
          messageId: "negativeName",
          data: { name: "disableCache", suggestion: "enableCache" },
        },
      ],
    },
    // the allow list is exact-match: an unlisted sibling is still reported
    {
      code: `const isNotReady = true; const wasNotSent = false;`,
      options: [{ allow: ["isNotReady"] }],
      errors: [
        {
          messageId: "negativeName",
          data: { name: "wasNotSent", suggestion: "wasSent" },
        },
      ],
    },
  ],
});
