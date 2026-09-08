// The spec-traceability parsers ship inside the package (src/vendor/spec),
// compiled to dist/vendor/spec and reached through the "#spec/*" import map so
// the same rule source runs from src/ (tests) and dist/ (consumers).
export { parseDocStatus, statusTier } from "#spec/spec-status.js";
export {
  coverageTier,
  expectedStatus,
  statementCoverage,
  statusLabel,
  unlinkedTestableStatements,
} from "#spec/spec-status-coverage.js";
export { linksForStatements, resolveLinkPath } from "#spec/spec-link-parser.js";
export { isTestFile } from "#spec/test-paths.js";
