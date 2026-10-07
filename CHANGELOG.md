# Changelog

## 1.8.0

- `eslint --fix` now resolves three more rules. `no-nested-if` merges an `if`
  whose whole body is one `if`, neither with an `else`, into `if (a && b)`,
  parenthesising an operand that binds looser than `&&` and leaving the report
  unfixed when a comment or sibling statement would be lost.
  `no-closing-brace-comments` deletes the marker comment. `require-fetch-timeout`
  takes a new `timeoutMs` option and, when it is set, adds
  `signal: AbortSignal.timeout(timeoutMs)` to the call; without the option, or
  with options the rule cannot see into (`fetch(url, init)`), it only reports.

## 1.7.0

- New opt-in `no-unguarded-async-button` rule: a `<button type="submit">`, or a
  button whose `onClick` is an async function, with no `disabled` binding is
  reported, since a second click starts the request again. A handler name is
  followed in scope to `async function`, `const f = async () =>` and
  `useCallback(async () => …)`; a spread passes, as it may carry the guard, and
  `aria-disabled` does not count. `components` adds a consumer's own button
  components, and `pendingComponent` / `submitComponent` name the house
  replacement in the message. Syntactic only, so it runs without type
  information.

## 1.6.0

- New `no-ungrounded-spec-name`: a repository path a spec or ADR names in
  backticks, or bare in a quoted passage, must exist. `no-dead-md-links` cannot
  see these — the house convention writes code paths as inline code precisely so
  they are not link-checked, which let a spec name a file deleted months before.
  It vendors the planning line's own grounding parser, keeps that parser's escape
  hatches (a line saying the change ADDS the path, or a files-touched list naming
  it), reports a retired component with the hint that says what took its work,
  and skips a rejected or retired document. Identifier findings are left to the
  planning line, which has the file contents to judge them. In the `specs` preset
  at `warn`.
- New `specs` preset: `reLint.configs.specs({ markdown })` wires the five
  document rules over `specs/**/spec.md`, `adrs/**/*.md` and every markdown
  file, plus `require-spec-link` over test files, at the severities the
  repository this package grew out of runs them. README § Keeping specs true
  gives the adoption recipe: the preset, `re-lint-reanchor` at the end of the
  `format` script, and a CI job that commits the healed anchors back or fails
  on `--check`.
- `re-lint-reanchor` reports a `[validated by <title>]` link into a test file
  when no `it()`/`test()` there carries the title, in both modes, and leaves
  the link as it was. Until now the link fell through to the hunk mapping, so
  a label left stale by a renamed test kept passing `--check` for as long as
  its line still mapped.
- `re-lint-reanchor` reads every link form a consumer's specs use, so it can
  replace a consumer's own copy of this logic: an href written from the repo root
  (`src/a.test.ts#L3`) beside the `../` form, and a bare href read beside the
  document when no file sits at the root; an `implemented by <title>` label
  and a bare `[<title>]` label follow their test like `validated by <title>`
  does, though a bare label naming no test is mapped through the hunks rather
  than reported; a `file.test.ts:NN` label names no test and is kept as
  written. The default corpus widens to `specs/**/*.md` and `adrs/**/*.md`.
  A URL is left alone.

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
