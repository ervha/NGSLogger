import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// 画面側の ESLint は apps/web の設定に任せる。ここはフレームワークに依存しないパッケージ用。
export default defineConfig([
  globalIgnores(["**/dist/**", "**/node_modules/**", "apps/**"]),
  {
    files: ["packages/**/*.ts", "vitest.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/*/src/**/*.ts"],
    rules: {
      // core / db / platform はブラウザと Tauri の両方から使う。Node 専用 API は置かない。
      "no-restricted-imports": ["error", { patterns: ["node:*"] }],
    },
  },
]);
