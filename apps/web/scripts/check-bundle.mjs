import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");
const needles = ["@tauri-apps", "tauri-plugin", "plugin:opener", "__TAURI_INTERNALS__"];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!/\.(js|css|html|map)$/.test(entry.name)) continue;
    const text = await readFile(full, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) {
        console.error(`${full} に ${needle} が含まれています。Web 版のビルドに Tauri のコードが入っています。`);
        process.exitCode = 1;
      }
    }
  }
}

await walk(root);
if (process.exitCode) process.exit(process.exitCode);
console.log("Web 版のビルドに Tauri のコードは入っていません");
