import { test } from "node:test";
import assert from "node:assert/strict";

import { docKind } from "./doc-kind.mjs";

test("returns spec for a spec.md under specs/", () => {
  assert.equal(docKind("specs/my-feature/spec.md"), "spec");
});

test("returns spec for an absolute path containing /specs/", () => {
  assert.equal(docKind("/home/dev/lore/specs/my-feature/spec.md"), "spec");
});

test("returns adr for an ADR under adrs/", () => {
  assert.equal(docKind("adrs/ADR-001-a-decision.md"), "adr");
});

test("returns adr for an absolute path containing /adrs/", () => {
  assert.equal(docKind("/home/dev/lore/adrs/ADR-001-a-decision.md"), "adr");
});

test("returns adr for a windows-separated ADR path", () => {
  assert.equal(docKind("C:\\dev\\lore\\adrs\\ADR-001-a-decision.md"), "adr");
});

test("returns null for a doc outside specs/ and adrs/", () => {
  assert.equal(docKind("docs/readme.md"), null);
});

test("returns adr when both segments appear and adrs/ is the deeper one", () => {
  assert.equal(docKind("specs/my-feature/adrs/ADR-001.md"), "adr");
});

test("returns spec for a file under a configured spec root", () => {
  assert.equal(
    docKind("docs/features/widgets/spec.md", {
      spec: ["docs/features"],
      adr: [],
    }),
    "spec",
  );
});

test("returns adr for a file under a configured adr root", () => {
  assert.equal(
    docKind("docs/decisions/0001-a-decision.md", {
      spec: [],
      adr: ["decisions"],
    }),
    "adr",
  );
});

test("returns null for specs/ when the roots option does not name it", () => {
  assert.equal(
    docKind("specs/my-feature/spec.md", { spec: ["docs/features"], adr: [] }),
    null,
  );
});

test("falls back to the default for a missing roots key", () => {
  assert.equal(docKind("adrs/ADR-001.md", { spec: ["docs"] }), "adr");
});
