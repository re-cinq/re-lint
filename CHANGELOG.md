# Changelog

## 1.0.1

- `no-flag-params` no longer reports a boolean passed to an assertion matcher. `expect(ok).toBe(true)` states what the value is; the boolean is the assertion, not a switch the callee reads. Matchers reached through `.not`, `.resolves` and `.rejects` are covered too.

## 1.0.0

First release. Extracted from re-cinq/lore `tools/eslint-plugin-lore` (commit 4536b6c6f).

- 27 house rules made repository-agnostic: layout markers became rule options or consumer `files` globs; `no-infra-sdk-in-floor` became `no-forbidden-imports`.
- The spec-traceability parsers ship inside the package (`src/vendor/spec`).
- New `no-duplicate-code` rule backed by jscpd, reporting each duplicated block with its full range.
- New Clean Code rules: `no-flag-params`, `no-commented-out-code`, `no-closing-brace-comments`, `no-negative-names`, `max-expects`, `no-nondeterministic-tests`, `prefer-polymorphism`, `max-member-chain`, `callee-below-caller`, `declare-near-use`, `no-hybrid-class`.
- `configs.recommended` preset.
