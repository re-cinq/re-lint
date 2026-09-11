import { RuleTester } from "eslint";
import css from "@eslint/css";
import rule from "./prefer-design-tokens.mjs";

const ruleTester = new RuleTester({
  plugins: { css },
  language: "css/css",
  languageOptions: { tolerant: true },
});

function raw(property, group, literal) {
  return { messageId: "rawValue", data: { property, group, literal } };
}

ruleTester.run("prefer-design-tokens", rule, {
  valid: [
    {
      name: "a custom property definition is where a token's value lives",
      code: ":root { --space-2: 8px; --accent: #0071e3; --fw-bold: 700; }",
    },
    {
      name: "token references in every governed group",
      code: ".a { color: var(--text); padding: var(--space-2) var(--space-3); border-radius: var(--radius); box-shadow: var(--shadow); z-index: var(--z-dropdown); }",
    },
    {
      name: "a var() fallback is part of the token reference",
      code: ".a { font-family: var(--font-mono, monospace); color: var(--text, #333); }",
    },
    {
      name: "zero, keywords and transparent colors carry no scale",
      code: ".a { margin: 0 auto; padding: 0; color: inherit; background: transparent; border-color: currentColor; box-shadow: none; font-family: inherit; font-weight: bold; line-height: normal; }",
    },
    {
      name: "a token scaled by calc() is still the token",
      code: ".a { margin: calc(var(--space-2) * -1); }",
    },
    {
      name: "a color function built from tokens is not a raw color",
      code: ".a { background: rgb(var(--shadow-rgb) / 10%); color: color-mix(in srgb, var(--accent) 40%, var(--bg)); }",
    },
    {
      name: "properties outside the governed groups keep their own values",
      code: ".a { width: 240px; max-height: 60vh; border-width: 1px; top: 4px; }",
    },
    {
      name: "a border shorthand's width is not its color",
      code: ".a { border: 1px solid var(--border); }",
    },
    {
      name: "a percentage radius is relative, not a scale step",
      code: ".avatar { border-radius: 50%; }",
    },
    {
      name: "a font-face declaration names the family it defines",
      code: '@font-face { font-family: "Gohu"; src: url(gohu.woff2); }',
    },
    {
      name: "an SCSS variable the parser keeps as raw text is skipped",
      code: ".a { gap: $gap; }",
    },
    {
      name: "a value listed in allow passes",
      code: ".a { line-height: 1; z-index: 1; }",
      options: [{ allow: ["1"] }],
    },
    {
      name: "a group left out of groups is not checked",
      code: ".a { z-index: 10; }",
      options: [{ groups: ["color"] }],
    },
  ],
  invalid: [
    {
      name: "a hex color",
      code: ".a { color: #fff; }",
      errors: [raw("color", "color", "#fff")],
    },
    {
      name: "a named color inside color-mix()",
      code: ".a { background-color: color-mix(in srgb, var(--accent) 50%, white); }",
      errors: [raw("background-color", "color", "white")],
    },
    {
      name: "an rgb() color in a border shorthand",
      code: ".a { border: 1px solid rgb(0 0 0 / 10%); }",
      errors: [raw("border", "color", "rgb(0 0 0 / 10%)")],
    },
    {
      name: "a pixel padding, reported once at the first raw length",
      code: ".a { padding: 4px 8px; }",
      errors: [{ ...raw("padding", "spacing", "4px"), line: 1, column: 15 }],
    },
    {
      name: "a rem gap",
      code: ".a { gap: 0.5rem; }",
      errors: [raw("gap", "spacing", "0.5rem")],
    },
    {
      name: "a logical margin property",
      code: ".a { margin-inline-start: 12px; }",
      errors: [raw("margin-inline-start", "spacing", "12px")],
    },
    {
      name: "a pixel font size",
      code: ".a { font-size: 13px; }",
      errors: [raw("font-size", "font-size", "13px")],
    },
    {
      name: "a numeric font weight",
      code: ".a { font-weight: 600; }",
      errors: [raw("font-weight", "font-weight", "600")],
    },
    {
      name: "a unitless line height",
      code: ".a { line-height: 1.5; }",
      errors: [raw("line-height", "line-height", "1.5")],
    },
    {
      name: "a corner radius",
      code: ".a { border-top-left-radius: 4px; }",
      errors: [raw("border-top-left-radius", "radius", "4px")],
    },
    {
      name: "a shadow with raw offsets around a token color",
      code: ".a { box-shadow: 0 1px 2px var(--shadow-color); }",
      errors: [raw("box-shadow", "shadow", "1px")],
    },
    {
      name: "a z-index",
      code: ".a { z-index: 10; }",
      errors: [raw("z-index", "z-index", "10")],
    },
    {
      name: "a font stack",
      code: '.a { font-family: "Inter", sans-serif; }',
      errors: [raw("font-family", "font-family", '"Inter"')],
    },
    {
      name: "a raw color in an SCSS nested rule",
      code: ".a { &:hover { color: red; } }",
      errors: [raw("color", "color", "red")],
    },
    {
      name: "a raw color inside a media query",
      code: "@media (min-width: 600px) { .a { color: #000; } }",
      errors: [raw("color", "color", "#000")],
    },
    {
      name: "an allowed value does not hide a raw one beside it",
      code: ".a { padding: 1px 6px; }",
      options: [{ allow: ["1px"] }],
      errors: [raw("padding", "spacing", "6px")],
    },
  ],
});
