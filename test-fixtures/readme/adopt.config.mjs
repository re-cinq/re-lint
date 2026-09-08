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
