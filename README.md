# @re-cinq/eslint-plugin-re-lint

re:cinq's house ESLint rules for TypeScript repositories: complexity budgets,
naming, function shape, comments, tests, folder layering, spec traceability,
and jscpd-backed duplicate detection. Flat config only. The plugin key is
`re-lint`, so every rule reads `re-lint/<name>`.

The rules were extracted from the [re-cinq/lore](https://github.com/re-cinq/lore)
monorepo, where each one was introduced against a real failure mode and driven
to zero findings before being promoted to `error`. Most of them encode the
Clean Code cheat-sheet; the mapping is at the end of this document.

## Install

```sh
npm i -D @re-cinq/eslint-plugin-re-lint eslint typescript-eslint
```

Optional peers, needed only by the rules that use them:

| Peer                       | Needed by                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `@stylistic/eslint-plugin` | the `recommended` preset's blank-line rules (pass it in; omitted otherwise)                         |
| `@eslint/markdown`         | the four markdown rules (`require-*`, `no-dead-md-links`), which run under `language: markdown/gfm` |
| `@eslint/css`              | `prefer-design-tokens`, which runs on stylesheets under `language: css/css`                         |
| `typescript`               | `no-forwarding-class` (type-aware; needs `parserOptions.projectService`)                            |
| `jscpd` (5.x)              | `no-duplicate-code`                                                                                 |

Node 20 or newer, ESLint 9 or newer.

## Quick start

The `recommended` preset switches on every rule that needs no repository
knowledge, plus the ESLint core and typescript-eslint rules that back the
same guidelines (`complexity` 6, `max-lines-per-function` 30, `max-params` 3,
`max-depth` 2, `no-magic-numbers`, `id-length`, `no-negated-condition`,
`naming-convention` without `I` prefixes or `Type` suffixes, and more).
`typescript-eslint` and `@stylistic/eslint-plugin` are passed in rather than
imported, so the package depends on neither; leave one out and its rules are
left out too.

```js
import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  ...reLint.configs.recommended({ tseslint, stylistic }),
);
```

Or wire rules by hand:

```js
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-nested-if": "error",
      "re-lint/no-flag-params": "error",
      "re-lint/max-boolean-operators": ["error", { max: 2 }],
    },
  },
];
```

Every rule is `error` in the preset. Repositories adopting the package on an
existing codebase override the noisy ones to `warn` (see
[Adopting in an existing repository](#adopting-in-an-existing-repository)).

## Rule reference

Options are listed with their defaults. "Preset" says whether the rule is in
`configs.recommended`; rules marked "opt-in" need an option or a `files` scope
that only the consumer knows, and report nothing until they get it.

### Complexity and control flow

| Rule                       | Reports                                                                                                                                 | Options                                                      | Fix | Preset |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --- | ------ |
| `no-nested-if`             | an `if` inside another `if` in the same function; `else if` chains are one level                                                        |                                                              |     | yes    |
| `no-nested-loop`           | a loop inside another loop in the same function                                                                                         |                                                              |     | yes    |
| `prefer-early-return`      | a function whose body is one big `if`; inverts it into a guard clause                                                                   |                                                              | yes | yes    |
| `max-boolean-operators`    | a condition or assignment with more than `max` `&&`/`\|\|` operators; extract a named predicate                                         | `max: 2`                                                     |     | yes    |
| `no-catch-as-control-flow` | a `catch` that swallows or branches on an error instead of handling it                                                                  |                                                              |     | yes    |
| `prefer-polymorphism`      | a `switch` or if/else-if chain dispatching on an object's tag (`x.type`, `x.kind`) with `minCases` or more branches                     | `minCases: 3`, `discriminants: []` (any property when empty) |     | yes    |
| `max-member-chain`         | a member chain deeper than `max` hops (Law of Demeter); `this`, well-known globals, `allowRoots`, and all-call fluent chains are exempt | `max: 2`, `allowRoots: []`                                   |     | yes    |

### Names

| Rule                              | Reports                                                                                                             | Options                                    | Fix | Preset                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --- | ----------------------------- |
| `no-vague-names`                  | declarations named `data`, `temp`, `obj`, `x`, and the rest of the blocklist                                        | `names: [...]` (replaces the default list) |     | yes                           |
| `no-negative-names`               | `isNotReady`, `notFound`, `hasNoItems`, `disableX`, `hideX`, `preventX`; suggests the positive name                 | `allow: []`                                |     | yes                           |
| `default-export-matches-filename` | a default export whose name differs from the file's; for Next.js app dirs, `reserved` files must be pure re-exports | `reserved: "error" \| "off"`               |     | opt-in (scope to the app dir) |

### Functions

| Rule                    | Reports                                                                                                  | Options                                                                              | Fix | Preset                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --- | ------------------------- |
| `no-flag-params`        | a parameter typed `boolean` or defaulted to `true`/`false`, and a bare `true`/`false` argument at a call | `allowNamed: true` (destructured params and `{ force: true }` objects are not flags) |     | yes                       |
| `no-prop-mutation`      | assignment into a function's parameters (props, args) instead of returning a new value                   |                                                                                      |     | opt-in (scope to UI code) |
| `no-forwarding-class`   | a class that only forwards 1:1 to its single injected port; pass the port itself. Type-aware             |                                                                                      |     | yes                       |
| `require-fetch-timeout` | an outbound `fetch` without a `signal`                                                                   |                                                                                      |     | yes                       |
| `callee-below-caller`   | a top-level function declared above the function that first calls it                                     | `exportedFirst: true`                                                                |     | yes                       |
| `declare-near-use`      | a `const`/`let` declared more than `maxDistance` statements before its first use in the same block       | `maxDistance: 5`                                                                     |     | yes                       |

### Comments

| Rule                        | Reports                                                                                     | Options  | Fix | Preset             |
| --------------------------- | ------------------------------------------------------------------------------------------- | -------- | --- | ------------------ |
| `max-comment-lines`         | a comment (or run of line comments) longer than `max` lines; `0` bans comments              | `max: 1` |     | yes (`0` in tests) |
| `no-commented-out-code`     | a comment whose text parses as code; consecutive line comments are one candidate            |          |     | yes                |
| `no-closing-brace-comments` | `} // end if`, `}); // end describe`: a comment after a closing brace of a multi-line block |          |     | yes                |

### Objects and modules

| Rule                          | Reports                                                                                                      | Options                                                                                       | Fix | Preset                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --- | ------------------------- |
| `no-hybrid-class`             | a class with public mutable fields and methods: half data structure, half object                             | `ignoreDecorated: true`                                                                       |     | yes                       |
| `no-reexport-only-module`     | a module whose whole top level is re-exports; forward from an index instead                                  | `allow: ["page.tsx", "layout.tsx", "route.ts"]`                                               |     | yes                       |
| `no-inline-styles`            | `style={{ ... }}` in JSX; use a colocated stylesheet                                                         |                                                                                               |     | opt-in (scope to UI code) |
| `no-io-in-view`               | a presentational component (`<name>View.tsx` and friends) importing the data layer or calling the network    | `viewSuffixes: ["View","Card","Table","Section","Badge","Row"]`, `dataModules: []` (required) |     | opt-in                    |
| `no-sql-in-web-ui`            | SQL strings or a database client in UI code; move the query behind an API route                              |                                                                                               |     | opt-in (scope to UI code) |
| `no-row-types-outside-models` | a type restating a table's columns outside the models directory                                              | `modelsDir: ""`, `exemptNames: []`                                                            |     | opt-in                    |
| `prefer-enforce-true`         | `if (!cond) throw ...` guards; rewrites to `enforceTrue(cond, Error, message)` imported from `enforceModule` | `enforceModule: { specifier, sourceDir? }` (required)                                         | yes | opt-in                    |
| `prefer-api-error`            | an if-return answering `h.response({ error }).code(4xx)`; rewrites to `enforceTrue(cond, apiError(status))`  | `enforceModule`, `errorModules: [{ root, path }]` (required)                                  | yes | opt-in                    |

### Architecture

| Rule                    | Reports                                                                                                  | Options                                                                              | Fix | Preset |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --- | ------ |
| `no-forbidden-imports`  | an import of a configured specifier or any subpath under it                                              | `forbidden: [{ specifier, message? }]` (required)                                    |     | opt-in |
| `no-cross-layer-import` | an import that crosses the folder layering declared in a `layers.yaml` found by walking up from the file | `layers`, `aliases`, `root` (inline alternative to the file), `firstPartyScopes: []` |     | opt-in |

A `layers.yaml` lists, per folder, what it may import:

```yaml
layers:
  domain: []
  work: [domain]
  outbound: [domain]
  transport: [domain, work, outbound]
tests: ["**/*.test.ts"]
```

Repository-layout rules in one place, with the values the Lore monorepo uses:

```js
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["apps/web-ui/src/**/*.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-inline-styles": "error",
      "re-lint/no-prop-mutation": "error",
      "re-lint/no-sql-in-web-ui": "error",
      "re-lint/default-export-matches-filename": "error",
      "re-lint/no-io-in-view": [
        "error",
        { dataModules: ["@/lib/db", "@/lib/github"] },
      ],
    },
  },
  {
    files: ["apps/floor/src/**/*.ts"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-forbidden-imports": [
        "error",
        {
          forbidden: [
            {
              specifier: "@google-cloud/storage",
              message: "Reach storage through the shared port adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-row-types-outside-models": [
        "error",
        { modelsDir: "libs/shared/src/models", exemptNames: ["PipelineTask"] },
      ],
      "re-lint/prefer-enforce-true": [
        "error",
        {
          enforceModule: {
            specifier: "@re-cinq/lore-shared/lib/enforce.js",
            sourceDir: "libs/shared/src",
          },
        },
      ],
      "re-lint/test-imports-its-subject": [
        "error",
        { firstPartyScopes: ["@re-cinq"] },
      ],
      "re-lint/no-cross-layer-import": [
        "error",
        { firstPartyScopes: ["@re-cinq"] },
      ],
    },
  },
  {
    files: ["apps/lore-api/src/**/*.ts", "apps/floor/src/**/*.ts"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/prefer-api-error": [
        "error",
        {
          enforceModule: { specifier: "@re-cinq/lore-shared/lib/enforce.js" },
          errorModules: [
            { root: "apps/lore-api/src", path: "server/api-error.js" },
            { root: "apps/floor/src", path: "delivery/http/api-error.js" },
          ],
        },
      ],
    },
  },
];
```

### Tests

| Rule                        | Reports                                                                                                                    | Options                                      | Fix | Preset           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --- | ---------------- |
| `max-expects`               | more than `max` `expect(...)` calls in one `it`/`test` body; `expect.assertions` is free                                   | `max: 1`                                     |     | yes (test files) |
| `no-nondeterministic-tests` | `Math.random`, `Date.now`, `new Date()`, `performance.now`, `crypto.randomUUID` in a test file unless that family is faked |                                              |     | yes (test files) |
| `require-colocated-tests`   | a test under `__tests__/` instead of beside its source                                                                     |                                              |     | yes              |
| `test-imports-its-subject`  | a test that never imports the real module it names; `firstPartyScopes` says which npm scopes are yours                     | `firstPartyScopes: []`                       |     | yes              |
| `require-spec-link`         | a test not linked from any spec or ADR via an inline `([validated by](test.ts#L12))` link                                  | `specsRoot: "."`, `roots: ["specs", "adrs"]` |     | opt-in           |

### Documents (markdown)

These run on `spec.md` and ADR files under `language: "markdown/gfm"` from
`@eslint/markdown`. Statements in a spec carry their evidence inline:

```md
Every task creates an Issue. ([validated by](src/tasks/create.test.ts#L42))
```

| Rule                              | Reports                                                                                                    | Options                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `require-intro-paragraph`         | a document without a lead paragraph between its title and the first section                                | `roots: { spec: ["specs"], adr: ["adrs"] }` |
| `require-statement-links`         | a testable statement with no `([validated by](...))` link                                                  | `roots`                                     |
| `require-status-matches-coverage` | a `\| Status \|` row that disagrees with link coverage: none is Draft, some is In Progress, all is Shipped | `roots`                                     |
| `no-dead-md-links`                | a markdown link to a repository file that does not exist, or a `#Lnn` past the end of the file             |                                             |

```js
import markdown from "@eslint/markdown";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["specs/**/spec.md", "adrs/**/*.md"],
    plugins: { markdown, "re-lint": reLint },
    language: "markdown/gfm",
    rules: {
      "re-lint/require-intro-paragraph": "error",
      "re-lint/require-statement-links": "warn",
      "re-lint/require-status-matches-coverage": "error",
      "re-lint/no-dead-md-links": "error",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/require-spec-link": ["error", { roots: ["specs", "adrs"] }],
    },
  },
];
```

### Styles (CSS)

These run on stylesheets under `language: "css/css"` from `@eslint/css`. With
`languageOptions.tolerant` they read SCSS nesting too; a value the parser keeps
as raw text, such as `$gap`, is skipped.

| Rule                   | Reports                                                                  | Options           |
| ---------------------- | ------------------------------------------------------------------------ | ----------------- |
| `prefer-design-tokens` | a raw value in a governed property, where a `var(--…)` design token fits | `groups`, `allow` |

Each governed property belongs to one group, modelled on Bootstrap's variable
scales. A value is raw when it is the literal kind the group's scale exists to
replace:

| Group         | Properties                                                                            | Raw value                                                  | Bootstrap scale    |
| ------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ |
| `color`       | `color`, `background`, `border*`, `outline*`, `fill`, `stroke`, `text-decoration*`, … | hex, named color, `rgb()`/`hsl()`/… with no `var()` inside | theme colors       |
| `spacing`     | `margin*`, `padding*`, `gap`, `row-gap`, `column-gap`                                 | a non-zero length                                          | `$spacers`         |
| `font-size`   | `font-size`                                                                           | a non-zero length                                          | `$font-sizes`      |
| `font-weight` | `font-weight`                                                                         | a number                                                   | `$font-weight-*`   |
| `line-height` | `line-height`                                                                         | a number or length                                         | `$line-height-*`   |
| `radius`      | `border-radius`, `border-*-radius`                                                    | a non-zero length                                          | `$border-radius-*` |
| `shadow`      | `box-shadow`, `text-shadow`                                                           | a length or a color                                        | `$box-shadow-*`    |
| `z-index`     | `z-index`                                                                             | a non-zero number                                          | `$zindex-*`        |
| `font-family` | `font-family`                                                                         | a font name                                                | `$font-family-*`   |

What passes: custom property definitions (the token file is where raw values
live), anything inside `var()` including its fallback, `0`, keywords (`auto`,
`inherit`, `transparent`, `currentColor`, `bold`), percentages, a color function
built from tokens, and the family an `@font-face` block defines. `groups` limits
the check to the named groups; `allow` exempts exact values, such as a `1px`
hairline.

```js
import css from "@eslint/css";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["**/*.{css,scss}"],
    plugins: { css, "re-lint": reLint },
    language: "css/css",
    languageOptions: { tolerant: true },
    rules: {
      "re-lint/prefer-design-tokens": ["warn", { allow: ["1px"] }],
    },
  },
];
```

### Duplication: `no-duplicate-code`

Wraps [jscpd](https://github.com/kucherenko/jscpd) 5, which is a native binary
with no Node API. The rule runs it once per ESLint process over `roots`, indexes
the JSON report by file, and reports every duplicated block in the file being
linted with the block's full start and end position, so an editor underlines
the whole clone and the message names its twin:

```
66 lines (330 tokens) duplicated with b.ts:10-75
```

| Option      | Default  | Meaning                                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------------------- |
| `roots`     | `["."]`  | directories jscpd scans, relative to the ESLint cwd; narrow on large repos                        |
| `minTokens` | `50`     | smallest clone reported                                                                           |
| `minLines`  | jscpd's  | smallest clone in lines                                                                           |
| `mode`      | jscpd's  | `mild`, `weak` (skip comments) or `strict`                                                        |
| `ignore`    |          | file globs jscpd skips                                                                            |
| `jscpdBin`  | resolved | path to jscpd's `run-jscpd.js`; by default found by walking up from cwd to a `node_modules/jscpd` |

How the scan is cached: one scan per process and option set. In a one-shot
`eslint` run every file predates the scan, so nothing rescans. In an editor's
long-lived ESLint server, saving a file makes it newer than the scan, and the
rule rescans when that file, or the twin of any clone it holds, is linted; a
clone you remove disappears on both sides in the same pass. When ESLint runs
with `--concurrency`, each worker scans once. If jscpd cannot be found or fails,
the rule reports a single `unavailable` message naming the install command
instead of throwing.

```js
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [
  {
    files: ["{apps,libs}/*/src/**/*.{ts,tsx}"],
    plugins: { "re-lint": reLint },
    rules: {
      "re-lint/no-duplicate-code": [
        "error",
        {
          roots: ["apps", "libs"],
          formats: ["typescript", "tsx"],
          minTokens: 50,
          ignore: ["**/dist/**", "**/*.d.ts", "**/fixtures/**"],
        },
      ],
    },
  },
];
```

## Re-anchoring spec links: `re-lint-reanchor`

A `#L42` link in a spec drifts the moment its cited file gains or loses a line
above it. The `re-lint-reanchor` command heals those links from git, with no
content search:

```sh
npx re-lint-reanchor            # rewrite drifted links against origin/main
npx re-lint-reanchor --check    # CI: rewrite nothing, exit 1 on any finding
npx re-lint-reanchor --all develop
```

- A link labelled `[validated by <test title>]` into a test file moves to the
  line of the one `it()`/`test()` carrying that title. An anchor inside the
  test's body is kept while, mapped through the diff, it still lies in that
  test. A title two tests carry is reported; a title in backticks is unwrapped.
- Every other `[label](../path#Lnn)` link is paired with its copy in the merge
  base's version of the markdown and mapped through the cited file's
  `git diff -U0` hunks since `git merge-base <base-ref> HEAD` (plus
  `MERGE_HEAD` during an uncommitted merge). Reading the merge-base copy makes
  a second run a no-op. A link the branch added, or whose href it edited by
  hand, is kept as authored.
- A cited line the branch deleted or rewrote is reported for a manual fix. An
  anchor on a blank or closing-punctuation line, past the end of its file, or
  into a missing file is reported as rotten. A bare `[L42]` label is synced to
  its href's line.

Only links into files the branch changed are touched, so a pull request
carries no unrelated spec churn; `--all` sweeps every link. `base-ref`
defaults to `origin/main`. The corpus defaults to `specs/**/spec.md`,
`.specify/spec.md` and `adrs/*.md`; each `--corpus <glob>` replaces it
(`**`, `*` and `?` are supported). Exit codes: 0 clean, 1 on an unmapped or
rotten link (or, with `--check`, a stale or mislabelled one), 2 on a bad flag
or a base ref that does not resolve.

The logic is a pure module, so another tool can drive it with its own git
access:

```js
import {
  createReanchorer,
  formatReanchorReport,
  parseHunks,
} from "@re-cinq/eslint-plugin-re-lint/spec/spec-reanchor.js";

const reanchor = createReanchorer(
  { workingFile, hunks: (path) => parseHunks(diffOf(path)), isChanged },
  { check: true, all: false },
);
const { text, tally } = reanchor({ docPath, source, baseSource });
```

It also exports the building blocks: `anchorLinksIn`, `pairWithBase`,
`findTestDeclarations`, `normalizeTitle`, `titleOfLabel`, `mapLine`,
`rottenReason`, `syncedLabel`, `selectCorpus`, `globToRegExp` and
`DEFAULT_CORPUS`.

## Adopting in an existing repository

Switching everything to `error` on a codebase that predates the rules blocks
every PR at once. The practice that worked in Lore: start with the preset, put
each noisy rule at `warn`, record the finding count next to it, and promote a
rule to `error` in the same PR that drains its queue. A count in the config is
the ratchet: it only moves down.

```js
import tseslint from "typescript-eslint";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default tseslint.config(...reLint.configs.recommended({ tseslint }), {
  // Queue sizes on 2026-09-08: prefer-polymorphism 41, max-member-chain 17.
  // Each rule is promoted to "error" in the PR that empties its queue.
  rules: {
    "re-lint/prefer-polymorphism": "warn",
    "re-lint/max-member-chain": "warn",
  },
});
```

`npx eslint . -f json | jq '[.[].messages[].ruleId] | group_by(.) | map({(.[0]): length}) | add'`
prints the queue sizes.

## The Clean Code mapping

| Guideline                                                       | Enforced by                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Keep it simple; reduce complexity                               | `complexity`, `max-depth`, `no-nested-if`, `no-nested-loop`, `max-boolean-operators`, `prefer-early-return` |
| Prefer polymorphism to if/else or switch                        | `prefer-polymorphism`                                                                                       |
| Law of Demeter                                                  | `max-member-chain`, `no-cross-layer-import`, `no-forwarding-class`                                          |
| Use explanatory variables                                       | `max-boolean-operators`                                                                                     |
| Avoid negative conditionals                                     | `no-negated-condition`, `no-negative-names`                                                                 |
| Descriptive, searchable, unencoded names                        | `no-vague-names`, `id-length`, `naming-convention`                                                          |
| Replace magic numbers                                           | `no-magic-numbers`                                                                                          |
| Small functions that do one thing                               | `max-lines-per-function`, `max-statements`, `max-lines`                                                     |
| Fewer arguments                                                 | `max-params`                                                                                                |
| No side effects                                                 | `no-param-reassign`, `no-prop-mutation`, `no-catch-as-control-flow`                                         |
| No flag arguments                                               | `no-flag-params`                                                                                            |
| Comments: intent only, no noise, no closing-brace, no dead code | `max-comment-lines`, `no-commented-out-code`, `no-closing-brace-comments`                                   |
| Declare variables close to use; functions downward              | `declare-near-use`, `callee-below-caller`                                                                   |
| Short lines, no alignment, vertical whitespace                  | Prettier, `padding-line-between-statements`                                                                 |
| Avoid hybrid structures; small objects                          | `no-hybrid-class`, `max-classes-per-file`                                                                   |
| Tests: one assert, independent, repeatable                      | `max-expects`, `no-nondeterministic-tests`, `require-colocated-tests`, `test-imports-its-subject`           |
| Needless repetition                                             | `no-duplicate-code`                                                                                         |

Not lintable, left to code review: the boy scout rule, finding the root
cause, encapsulating boundary conditions, avoiding logical dependency, hiding
internal structure, base classes ignorant of their derivatives, and fast tests.

## Contributing

```sh
npm ci
npm test          # builds dist/, then runs every RuleTester suite
npm run lint      # the package passes its own rules
npm run format
```

A rule is one file, `src/rules/<name>.mjs`, with its RuleTester suite beside
it in `<name>.test.mjs`; helpers shared by several rules live in
`src/rules/lib/`. `src/rules/registration.test.mjs` fails when a rule file is
not exported from `src/index.mjs`, has no suite, or lacks `meta.docs.description`
and a `schema`; `src/index.test.mjs` fails when a rule is neither in the preset
nor listed as opt-in. Every config snippet in this README is a file under
`test-fixtures/readme/` that `src/readme.test.mjs` loads with the real ESLint
and checks appears here verbatim.

## Releasing

The version lives in three places and they must agree: `package.json`,
`package-lock.json`, and the `VERSION` constant in `src/index.mjs` that the
plugin reports as `meta.version`. Only the first is machine-checked, so bump
all three together.

1. Open a pull request that bumps the version and adds the `CHANGELOG.md`
   entry. The tag must match `package.json` exactly or the release fails.
2. Merge it, then tag the merge commit and push the tag:

   ```sh
   git fetch origin main
   git tag v<version> origin/main
   git push origin v<version>
   ```

3. Pushing the tag starts the publish workflow. It refuses a tag whose version
   differs from the manifest, runs the full suite, then _stages_ the version on
   npm with provenance over OIDC. No token is stored in CI.
4. Approve the stage. Until you do, the version sits on the registry and nobody
   can install it. Use the package's Versions tab on npmjs.com and approve with
   2FA, or:

   ```sh
   npm stage list
   npm stage approve <id>
   ```

The trusted publisher grants staged publishing only, so no workflow run can
make a version installable by itself. Publishing by hand bypasses that review
and loses the provenance attestation with it.

Two traps worth knowing. The `workflow_dispatch` trigger skips the version
check, because that step only runs for tag pushes, so prefer the tag. And if a
release fails for a reason you fix on `main`, re-running the old run will not
help: a re-run replays the workflow file from the commit the tag pointed at.
Move the tag instead, with `git tag -f` and `git push -f`, which is safe for a
version that never reached the registry.

## License

Apache-2.0
