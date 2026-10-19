import type { ImportSuccess } from "./workers/protocol.ts";

export interface BackupData {
  version: 1;
  exportedAt: string;
  files: ImportSuccess[];
  settings?: Record<string, unknown>;
}

/** データを JSON ファイルとしてローカルにダウンロード保存 */
export function exportDataAsJson(files: ImportSuccess[]): void {
  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    files,
    settings: {
      readChat: localStorage.getItem("meseta_read_chat") === "true",
      savedFolder: localStorage.getItem("meseta_saved_log_folder"),
      highlightWord: localStorage.getItem("meseta_chat_highlight"),
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `meseta-ledger-backup-${now}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** バックアップ JSON を読み込む */
export async function parseBackupFile(file: File): Promise<BackupData> {
  const text = await file.text();
  const parsed = JSON.parse(text) as BackupData;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.files)) {
    throw new Error("無効なバックアップファイル形式です");
  }
  return parsed;
}
