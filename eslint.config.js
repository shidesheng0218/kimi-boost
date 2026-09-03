import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "coverage/",
      "assets/",
      "docs/",
      ".zcode/",
      ".tmp/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // 大量 hook/工具脚本用 `catch { /* fail-open */ }` 故意吞错,允许空 catch
      "no-empty": ["error", { allowEmptyCatch: true }],
      // 存量代码有 `any`,先告警不阻断,后续逐步收紧
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
