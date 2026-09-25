# Changelog

## 1.5.0

- New `re-lint-reanchor` command heals the `#Lnn` links in spec markdown after
  a branch edits a cited file. A `[validated by <test title>]` link into a test
  file follows its `it()`/`test()` declaration. Every other link is paired with
  its merge-base copy and mapped through the cited file's `git diff -U0` hunks.
  A deleted or rewritten cited line, or an anchor on a blank line, past the end
  of its file or into a missing file, is reported. `[Lnnn]` labels follow their
  href. `--check` rewrites nothing and fails on any finding, `--all` widens the
  scope past the files the branch changed, and `--corpus` replaces the default
  `specs/**/spec.md`, `.specify/spec.md` and `adrs/*.md`.
- The pure logic ships as `spec/spec-reanchor.js`, beside the spec parsers.

## 1.4.1

- 1.4.0 reached npm without `prefer-design-tokens`: the tarball was packed from
  a `dist/` built before the rule existed, because nothing rebuilt it on publish.
  A `prepack` script now runs the build, so `npm pack` and `npm publish` always
  ship `dist/` compiled from the tagged source.

## 1.4.0

- New opt-in `prefer-design-tokens` rule for stylesheets, run under
  `language: "css/css"` from `@eslint/css` (now an optional peer). A raw color,
  spacing, font size, font weight, line height, radius, shadow, z-index or font
  family in a governed property is reported, so the value comes from a
  `var(--…)` token instead. The groups follow Bootstrap's variable scales.
  Custom property definitions, `var()` with its fallback, `0`, keywords and
  percentages pass; `groups` narrows the check and `allow` exempts exact values.

## 1.3.0

- `no-flag-params` treats a mock stub's value the same way it treats a state
  setter's: `mockResolvedValue(true)` and its siblings seed the answer a stub
  will give, rather than selecting a behaviour the callee branches on. The mock
  library owns the stub, so there is no second function to split into.

## 1.2.0

- `no-flag-params` no longer reports a boolean the callee stores rather than
  branches on: `useState(false)` and `useRef(true)` seed a value, and a
  one-argument `setX(false)` assigns one. Splitting those is not open to the
  caller, since React hands back the setter. A setter taking more than the
  value, such as `setPaused(id, true)`, is still a flag argument.

## 1.1.0

- `no-duplicate-code` no longer reports a match that is a module's shared
  dependency list. Two files importing the same things is what using a library
  looks like, and the only way to stop jscpd matching it is a barrel that hides
  where each symbol comes from. A match carrying fewer than three lines of real
  code is treated as imports plus the spillover past the last one.

## 1.0.1

- `no-flag-params` no longer reports a boolean passed to an assertion matcher. `expect(ok).toBe(true)` states what the value is; the boolean is the assertion, not a switch the callee reads. Matchers reached through `.not`, `.resolves` and `.rejects` are covered too.

## 1.0.0

First release. Extracted from re-cinq/lore `tools/eslint-plugin-lore` (commit 4536b6c6f).

- 27 house rules made repository-agnostic: layout markers became rule options or consumer `files` globs; `no-infra-sdk-in-floor` became `no-forbidden-imports`.
- The spec-traceability parsers ship inside the package (`src/vendor/spec`).
- New `no-duplicate-code` rule backed by jscpd, reporting each duplicated block with its full range.
- New Clean Code rules: `no-flag-params`, `no-commented-out-code`, `no-closing-brace-comments`, `no-negative-names`, `max-expects`, `no-nondeterministic-tests`, `prefer-polymorphism`, `max-member-chain`, `callee-below-caller`, `declare-near-use`, `no-hybrid-class`.
- `configs.recommended` preset.
