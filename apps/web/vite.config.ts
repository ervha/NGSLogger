import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri のときだけ相対パスにし、Web 版の公開ビルドには Tauri 用のコードを残さない。
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "tauri" ? "./" : "/",
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
}));
