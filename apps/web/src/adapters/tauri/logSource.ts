/**
 * Tauri 版のログの読み取り・自動スキャン。
 * ビルドモードが tauri のときだけ読み込む。
 * Web 版の成果物には入らない（vite がデッドコードとして落とす。CI で確認する）。
 */

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir, readFile } from "@tauri-apps/plugin-fs";
import type { ReadableLog } from "../web/logSource.ts";

export const SAVED_LOG_FOLDER_KEY = "meseta_saved_log_folder";
export const READ_CHAT_KEY = "meseta_read_chat";

function joinPath(dir: string, name: string): string {
  const separator = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(separator) ? `${dir}${name}` : `${dir}${separator}${name}`;
}

async function asReadable(path: string): Promise<ReadableLog> {
  const name = path.split(/[/\\\\]/).pop() || path;
  return {
    name,
    read: async () => readFile(path),
  };
}

/** 指定フォルダ配下のファイルをスキャンして ReadableLog 配列を返す */
export async function scanDirectoryLogs(dirPath: string): Promise<ReadableLog[]> {
  try {
    const isDir = await exists(dirPath);
    if (!isDir) return [];
    const entries = await readDir(dirPath);
    const files: ReadableLog[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      files.push(await asReadable(joinPath(dirPath, entry.name)));
    }
    files.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return files;
  } catch {
    return [];
  }
}

/** 前回の起動でダイアログから記録したログフォルダ。無ければ null。 */
export async function rememberedLogDirectory(): Promise<string | null> {
  return invoke<string | null>("remembered_log_directory");
}

/**
 * 公式ログフォルダの実パス。Windows では Known Folder のドキュメント
 * （OneDrive に移している場合はその場所）の下。フォルダが無いときは null。
 */
export async function officialLogDirectory(): Promise<string | null> {
  return invoke<string | null>("official_log_directory");
}

/**
 * フォルダ選択ダイアログを開き、選択されたフォルダを保存してファイルを返す。
 * ダイアログが許可したパスだけを Rust 側が記録する。ディスク全体は許可しない。
 * ログは UTF-16LE の生バイトなので readTextFile は使わない。
 */
export async function pickAndSaveDirectoryLogs(): Promise<{
  folderPath: string | null;
  files: ReadableLog[];
  rememberFailed: boolean;
}> {
  const selected = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title: "ログフォルダを選ぶ",
  });
  if (typeof selected !== "string" || !selected) {
    return { folderPath: null, files: [], rememberFailed: false };
  }

  let folderPath = selected;
  let rememberFailed = false;
  try {
    // 記録した表記（\\?\ を外したもの）を、このセッションの読み取りにも使う。
    folderPath = await invoke<string>("remember_log_directory", { path: selected });
  } catch (error) {
    // このセッションはダイアログが足したスコープで読める。記録だけ失敗している。
    // 画面に出す文言へ error は渡さない。パスが含まれるため。
    rememberFailed = true;
    console.warn("ログフォルダを記録できませんでした", error);
  }

  try {
    localStorage.setItem(SAVED_LOG_FOLDER_KEY, folderPath);
  } catch {
    // localStorage への保存失敗は無視
  }

  const files = await scanDirectoryLogs(folderPath);
  return { folderPath, files, rememberFailed };
}

/**
 * 従来のファイル／フォルダ選択
 */
export async function pickTauriLogs(mode: "files" | "directory"): Promise<ReadableLog[]> {
  if (mode === "directory") {
    const res = await pickAndSaveDirectoryLogs();
    return res.files;
  }

  const selected = await open({
    directory: false,
    multiple: true,
    title: "ログファイルを選ぶ",
  });
  if (selected === null) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  return Promise.all(paths.map((path) => asReadable(path)));
}
