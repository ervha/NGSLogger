import { defineConfig } from "vitest/config";

// packages/*/test だけを対象にする。画面の自動テストはまだ入れない（計画書 §7-9）。
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
