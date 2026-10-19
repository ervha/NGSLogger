import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages や Tauri など、サブパスやローカルファイルシステムでも動作するよう相対パスにする
export default defineConfig({
  plugins: [react()],
  base: "./",
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
});
