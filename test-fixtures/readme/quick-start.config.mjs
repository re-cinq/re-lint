import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  ...reLint.configs.recommended({ tseslint, stylistic }),
);
