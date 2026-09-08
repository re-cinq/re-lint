import calleeBelowCaller from "./rules/callee-below-caller.mjs";
import declareNearUse from "./rules/declare-near-use.mjs";
import defaultExportMatchesFilename from "./rules/default-export-matches-filename.mjs";
import maxBooleanOperators from "./rules/max-boolean-operators.mjs";
import maxCommentLines from "./rules/max-comment-lines.mjs";
import maxExpects from "./rules/max-expects.mjs";
import maxMemberChain from "./rules/max-member-chain.mjs";
import noCatchAsControlFlow from "./rules/no-catch-as-control-flow.mjs";
import noClosingBraceComments from "./rules/no-closing-brace-comments.mjs";
import noCommentedOutCode from "./rules/no-commented-out-code.mjs";
import noCrossLayerImport from "./rules/no-cross-layer-import.mjs";
import noDeadMdLinks from "./rules/no-dead-md-links.mjs";
import noDuplicateCode from "./rules/no-duplicate-code.mjs";
import noFlagParams from "./rules/no-flag-params.mjs";
import noForbiddenImports from "./rules/no-forbidden-imports.mjs";
import noForwardingClass from "./rules/no-forwarding-class.mjs";
import noHybridClass from "./rules/no-hybrid-class.mjs";
import noInlineStyles from "./rules/no-inline-styles.mjs";
import noIoInView from "./rules/no-io-in-view.mjs";
import noNegativeNames from "./rules/no-negative-names.mjs";
import noNestedIf from "./rules/no-nested-if.mjs";
import noNestedLoop from "./rules/no-nested-loop.mjs";
import noNondeterministicTests from "./rules/no-nondeterministic-tests.mjs";
import noPropMutation from "./rules/no-prop-mutation.mjs";
import noReexportOnlyModule from "./rules/no-reexport-only-module.mjs";
import noRowTypesOutsideModels from "./rules/no-row-types-outside-models.mjs";
import noSqlInWebUi from "./rules/no-sql-in-web-ui.mjs";
import noVagueNames from "./rules/no-vague-names.mjs";
import preferApiError from "./rules/prefer-api-error.mjs";
import preferEarlyReturn from "./rules/prefer-early-return.mjs";
import preferEnforceTrue from "./rules/prefer-enforce-true.mjs";
import preferPolymorphism from "./rules/prefer-polymorphism.mjs";
import requireColocatedTests from "./rules/require-colocated-tests.mjs";
import requireFetchTimeout from "./rules/require-fetch-timeout.mjs";
import requireIntroParagraph from "./rules/require-intro-paragraph.mjs";
import requireSpecLink from "./rules/require-spec-link.mjs";
import requireStatementLinks from "./rules/require-statement-links.mjs";
import requireStatusMatchesCoverage from "./rules/require-status-matches-coverage.mjs";
import testImportsItsSubject from "./rules/test-imports-its-subject.mjs";

const NAME = "@re-cinq/eslint-plugin-re-lint";
const VERSION = "0.1.0";

const rules = {
  "callee-below-caller": calleeBelowCaller,
  "declare-near-use": declareNearUse,
  "default-export-matches-filename": defaultExportMatchesFilename,
  "max-boolean-operators": maxBooleanOperators,
  "max-comment-lines": maxCommentLines,
  "max-expects": maxExpects,
  "max-member-chain": maxMemberChain,
  "no-catch-as-control-flow": noCatchAsControlFlow,
  "no-closing-brace-comments": noClosingBraceComments,
  "no-commented-out-code": noCommentedOutCode,
  "no-cross-layer-import": noCrossLayerImport,
  "no-dead-md-links": noDeadMdLinks,
  "no-duplicate-code": noDuplicateCode,
  "no-flag-params": noFlagParams,
  "no-forbidden-imports": noForbiddenImports,
  "no-forwarding-class": noForwardingClass,
  "no-hybrid-class": noHybridClass,
  "no-inline-styles": noInlineStyles,
  "no-io-in-view": noIoInView,
  "no-negative-names": noNegativeNames,
  "no-nested-if": noNestedIf,
  "no-nested-loop": noNestedLoop,
  "no-nondeterministic-tests": noNondeterministicTests,
  "no-prop-mutation": noPropMutation,
  "no-reexport-only-module": noReexportOnlyModule,
  "no-row-types-outside-models": noRowTypesOutsideModels,
  "no-sql-in-web-ui": noSqlInWebUi,
  "no-vague-names": noVagueNames,
  "prefer-api-error": preferApiError,
  "prefer-early-return": preferEarlyReturn,
  "prefer-enforce-true": preferEnforceTrue,
  "prefer-polymorphism": preferPolymorphism,
  "require-colocated-tests": requireColocatedTests,
  "require-fetch-timeout": requireFetchTimeout,
  "require-intro-paragraph": requireIntroParagraph,
  "require-spec-link": requireSpecLink,
  "require-statement-links": requireStatementLinks,
  "require-status-matches-coverage": requireStatusMatchesCoverage,
  "test-imports-its-subject": testImportsItsSubject,
};

/**
 * Rules the preset leaves to the consumer: each needs repository-specific
 * options (a layout, a module specifier, a document corpus) or an extra
 * language/binary, and reports nothing or fails without them.
 */
export const OPT_IN_RULES = [
  "no-cross-layer-import",
  "no-dead-md-links",
  "no-duplicate-code",
  "no-forbidden-imports",
  "no-io-in-view",
  "no-row-types-outside-models",
  "prefer-api-error",
  "prefer-enforce-true",
  "require-intro-paragraph",
  "require-spec-link",
  "require-statement-links",
  "require-status-matches-coverage",
  "no-inline-styles",
  "no-prop-mutation",
  "no-sql-in-web-ui",
  "default-export-matches-filename",
];

const TEST_ONLY_RULES = ["max-expects", "no-nondeterministic-tests"];

const RULE_OPTIONS = {
  "max-boolean-operators": { max: 2 },
  "max-comment-lines": { max: 1 },
};

const LINE_BUDGET = { max: 30, skipBlankLines: true, skipComments: true };

const CORE_RULES = {
  complexity: ["error", 6],
  "id-length": ["error", { min: 3, exceptions: ["i", "id", "_", "to", "fs"] }],
  "max-classes-per-file": ["error", 1],
  "max-depth": ["error", 2],
  "max-lines": ["error", { ...LINE_BUDGET, max: 300 }],
  "max-lines-per-function": ["error", LINE_BUDGET],
  "max-params": ["error", { max: 3 }],
  "max-statements": ["error", 15],
  "no-else-return": "error",
  "no-lonely-if": "error",
  "no-negated-condition": "error",
  "no-param-reassign": "error",
  "no-unneeded-ternary": "error",
  "prefer-const": "error",
};

const TYPESCRIPT_RULES = {
  "@typescript-eslint/no-magic-numbers": [
    "error",
    {
      ignore: [-1, 0, 1, 2],
      ignoreEnums: true,
      ignoreReadonlyClassProperties: true,
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true,
    },
  ],
  "@typescript-eslint/naming-convention": [
    "error",
    { selector: "default", format: ["camelCase"], leadingUnderscore: "forbid" },
    { selector: "variable", format: ["camelCase", "UPPER_CASE"] },
    { selector: "typeLike", format: ["PascalCase"] },
    {
      selector: "interface",
      format: ["PascalCase"],
      custom: { regex: "^I[A-Z]", match: false },
    },
    {
      selector: "typeAlias",
      format: ["PascalCase"],
      custom: { regex: "Type$", match: false },
    },
    { selector: "import", format: null },
    { selector: "objectLiteralProperty", format: null },
  ],
};

const STYLISTIC_RULES = {
  "@stylistic/padding-line-between-statements": [
    "error",
    { blankLine: "always", prev: "*", next: "return" },
    { blankLine: "always", prev: "multiline-block-like", next: "*" },
    { blankLine: "always", prev: "*", next: "multiline-block-like" },
  ],
};

function severityFor(name) {
  return name in RULE_OPTIONS ? ["error", RULE_OPTIONS[name]] : "error";
}

function presetRules(names) {
  return Object.fromEntries(
    names.map((name) => [`re-lint/${name}`, severityFor(name)]),
  );
}

const sourceRuleNames = Object.keys(rules).filter(
  (name) => !OPT_IN_RULES.includes(name) && !TEST_ONLY_RULES.includes(name),
);

/**
 * The preset. `tseslint` (typescript-eslint) and `stylistic`
 * (@stylistic/eslint-plugin) are passed in rather than imported so the package
 * depends on neither; the rules that need them are added only when given.
 */
function recommended({ tseslint, stylistic } = {}) {
  const plugins = { "re-lint": plugin };
  const extraRules = {};

  if (tseslint) {
    plugins["@typescript-eslint"] = tseslint.plugin;
    Object.assign(extraRules, TYPESCRIPT_RULES);
  }

  if (stylistic) {
    plugins["@stylistic"] = stylistic;
    Object.assign(extraRules, STYLISTIC_RULES);
  }

  return [
    {
      name: "re-lint/recommended",
      files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
      plugins,
      rules: { ...CORE_RULES, ...extraRules, ...presetRules(sourceRuleNames) },
    },
    {
      name: "re-lint/recommended-tests",
      files: ["**/*.{test,spec}.{ts,tsx,mts,js,jsx,mjs}"],
      plugins: { "re-lint": plugin },
      rules: {
        ...presetRules(TEST_ONLY_RULES),
        "max-lines-per-function": "off",
        "max-statements": "off",
        "re-lint/max-comment-lines": ["error", { max: 0 }],
        ...(tseslint ? { "@typescript-eslint/no-magic-numbers": "off" } : {}),
      },
    },
  ];
}

const plugin = {
  meta: { name: NAME, version: VERSION },
  rules,
  configs: {},
};

plugin.configs.recommended = recommended;

export default plugin;
