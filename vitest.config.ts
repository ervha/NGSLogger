import { defineConfig } from "vitest/config";

// 画面の自動テストはまだ入れない（計画書 §7-9）。
// 公式サイトを OS のブラウザで開くかの判定だけ、純関数のテストを足している。
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    environment: "node",
  },
});
