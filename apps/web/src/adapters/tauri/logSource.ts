/**
 * Tauri 版のログの読み方。ビルドモードが tauri のときだけ読み込む。
 * Web 版の成果物には入れない（vite がデッドコードとして落とす。CI で確認する）。
 *
 * 権限の初期値は、公式ログフォルダと exe 隣の data\ だけ。
 * ダイアログで選んだパスは、プラグインの説明どおり、その起動中だけ読み取りスコープに追加される。
 * 再起動後も覚えさせる仕組みはまだ入れていない。
 */

import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readFile } from "@tauri-apps/plugin-fs";
import type { ReadableLog } from "../web/logSource.ts";

function joinPath(dir: string, name: string): string {
  const separator = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(separator) ? `${dir}${name}` : `${dir}${separator}${name}`;
}

async function asReadable(path: string): Promise<ReadableLog> {
  const name = path.split(/[/\\]/).pop() || path;
  return {
    name,
    read: async () => readFile(path),
  };
}

export async function pickTauriLogs(mode: "files" | "directory"): Promise<ReadableLog[]> {
  const selected = await open({
    directory: mode === "directory",
    multiple: mode === "files",
    recursive: mode === "directory",
    title: mode === "directory" ? "ログフォルダを選ぶ" : "ログファイルを選ぶ",
  });
  if (selected === null) return [];

  if (mode === "directory") {
    if (typeof selected !== "string") return [];
    const entries = await readDir(selected);
    const files: ReadableLog[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      files.push(await asReadable(joinPath(selected, entry.name)));
    }
    files.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return files;
  }

  const paths = Array.isArray(selected) ? selected : [selected];
  return Promise.all(paths.map((path) => asReadable(path)));
}
