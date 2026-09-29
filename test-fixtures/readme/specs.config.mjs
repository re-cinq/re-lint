import markdown from "@eslint/markdown";
import reLint from "@re-cinq/eslint-plugin-re-lint";

export default [...reLint.configs.specs({ markdown })];
