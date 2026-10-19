import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canUseDirectoryPicker, logsFromFileList, pickDirectoryWithBrowser } from "./adapters/web/logSource.ts";
import type { ReadableLog } from "./adapters/web/logSource.ts";
import { inspectLog } from "./importClient.ts";
import { ChatViewer } from "./ChatViewer.tsx";
import type { ActionCountRow, ImportSuccess } from "./workers/protocol.ts";
import type { ChatRow } from "@meseta/core";
import "./App.css";

const ActionChart = lazy(() =>
  import("./ActionChart.tsx").then((mod) => ({ default: mod.ActionChart })),
);

const LOCAL_READ_CHAT_KEY = "meseta_read_chat";
const LOCAL_SAVED_FOLDER_KEY = "meseta_saved_log_folder";

function mergeCounts(files: readonly ImportSuccess[]): ActionCountRow[] {
  const totals = new Map<string, number>();
  for (const file of files) {
    for (const row of file.actionCounts) {
      totals.set(row.action, (totals.get(row.action) ?? 0) + row.count);
    }
  }
  return [...totals.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action, "ja"));
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ImportSuccess[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [readChat, setReadChat] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_READ_CHAT_KEY) === "true";
    } catch {
      return false;
    }
  });

  const directoryPicker = canUseDirectoryPicker();

  const handleToggleReadChat = (enabled: boolean) => {
    setReadChat(enabled);
    try {
      localStorage.setItem(LOCAL_READ_CHAT_KEY, String(enabled));
    } catch {
      // localStorage failure ignored
    }
  };

  const counts = useMemo(() => mergeCounts(files), [files]);
  const actionFiles = files.filter((file) => file.kind === "ActionLog" && !file.skipped).length;

  // 全ファイルから収集したチャット行のフラットリスト
  const allChatRows = useMemo<ChatRow[]>(() => {
    const list: ChatRow[] = [];
    for (const file of files) {
      if (file.chatRows && file.chatRows.length > 0) {
        list.push(...file.chatRows);
      }
    }
    return list;
  }, [files]);

  const load = useCallback(
    async (logs: readonly ReadableLog[], folderPath?: string) => {
      if (logs.length === 0) return;
      setBusy(true);
      setErrors([]);
      setFiles([]);
      if (folderPath) setCurrentFolder(folderPath);

      const next: ImportSuccess[] = [];
      const problems: string[] = [];

      for (let index = 0; index < logs.length; index += 1) {
        const log = logs[index];
        if (!log) continue;
        setProgress(`${index + 1} / ${logs.length} ファイル`);
        try {
          const bytes = await log.read();
          const response = await inspectLog(log.name, bytes, readChat);
          if (response.ok) next.push(response);
          else problems.push(`${response.fileName}: ${response.message}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "読み込みに失敗しました";
          problems.push(`${log.name}: ${message}`);
        }
      }

      setFiles(next);
      setErrors(problems);
      setProgress("");
      setBusy(false);
    },
    [readChat],
  );

  // Tauri（ポータブル版）起動時の自動読み取り
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");

    if (import.meta.env.MODE === "tauri") {
      void (async () => {
        try {
          const desktop = await import("./adapters/tauri/logSource.ts");
          const saved = localStorage.getItem(LOCAL_SAVED_FOLDER_KEY);
          if (saved) {
            setCurrentFolder(saved);
            const logs = await desktop.scanDirectoryLogs(saved);
            if (logs.length > 0) {
              await load(logs, saved);
            }
          }
        } catch {
          // 自動読み取り失敗時は手動操作を待つ
        }
      })();
    }
  }, [load]);

  async function chooseDirectory() {
    if (import.meta.env.MODE === "tauri") {
      const desktop = await import("./adapters/tauri/logSource.ts");
      const res = await desktop.pickAndSaveDirectoryLogs();
      if (res.files.length > 0) {
        await load(res.files, res.folderPath ?? undefined);
      }
      return;
    }
    if (!directoryPicker) {
      folderInput.current?.setAttribute("webkitdirectory", "");
      folderInput.current?.click();
      return;
    }
    try {
      await load(await pickDirectoryWithBrowser());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "フォルダを開けませんでした";
      setErrors([message]);
    }
  }

  return (
    <div
      className="page"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const dropped = event.dataTransfer.files;
        if (dropped.length > 0) void load(logsFromFileList(dropped));
      }}
    >
      <header className="masthead">
        <p className="eyebrow">PSO2 NGS / PC</p>
        <h1>メセタ帳</h1>
        <p className="lede">
          公式ログをローカルだけで読み、ActionLogの集計やチャット履歴を確認できます。外部サーバーには一切送信しません。
        </p>
      </header>

      <section className="notice" aria-label="このツールについて">
        <p>本ツールは非公式のファンメイドツールです。株式会社セガとは関係ありません。</p>
        <p>
          PHANTASY STAR ONLINE 2 NEW GENESIS （C）SEGA ／{" "}
          <a href="https://pso2.jp/players/">公式サイト</a>
        </p>
        <p>チャット履歴の読み取りはオプトイン制です（既定では本文を読みません）。</p>
      </section>

      <section className="panel">
        <div className="actions">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            ファイルを選ぶ
          </button>
          <button type="button" onClick={() => void chooseDirectory()} disabled={busy}>
            フォルダを選ぶ
          </button>
          {currentFolder && (
            <button
              type="button"
              onClick={async () => {
                if (import.meta.env.MODE === "tauri") {
                  const desktop = await import("./adapters/tauri/logSource.ts");
                  const logs = await desktop.scanDirectoryLogs(currentFolder);
                  await load(logs, currentFolder);
                }
              }}
              disabled={busy}
            >
              🔄 再読み込み
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const list = event.currentTarget.files;
              if (list && list.length > 0) void load(logsFromFileList(list));
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const list = event.currentTarget.files;
              if (list && list.length > 0) void load(logsFromFileList(list));
              event.currentTarget.value = "";
            }}
          />
        </div>

        {currentFolder ? (
          <p className="current-folder">
            現在のログフォルダ: <code>{currentFolder}</code>
          </p>
        ) : (
          <p className="hint">
            {directoryPicker
              ? "フォルダを指定すると次回以降自動で読み込みます。ファイルをこの画面へドロップしても読めます。"
              : "フォルダ選択からログフォルダ（ドキュメント\\SEGA\\PHANTASYSTARONLINE2\\log）を選んでください。"}
          </p>
        )}

        {busy && <p className="progress">{progress || "読み込んでいます…"}</p>}
      </section>

      {/* チャット履歴確認セクション */}
      <ChatViewer
        chatRows={allChatRows}
        readChat={readChat}
        onToggleReadChat={handleToggleReadChat}
      />

      {errors.length > 0 && (
        <section className="errors" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </section>
      )}

      {files.length > 0 && (
        <>
          <section className="summary">
            <p>
              {files.length} ファイルを読みました。ActionLog は {actionFiles} ファイル、アクション行は{" "}
              {counts.reduce((sum, row) => sum + row.count, 0)} 行です。
            </p>
            <p className="hint">メセタが動く操作は、アイテム行と金額行の 2 行で 1 組です。ここでの数字は行数です。</p>
          </section>
          {counts.length > 0 && (
            <Suspense fallback={<p className="hint">グラフを準備しています…</p>}>
              <ActionChart counts={counts} />
            </Suspense>
          )}
          <div className="file-list">
            {files.map((file) => (
              <article key={file.fileName} className="file-card">
                <header>
                  <h2>{file.fileName}</h2>
                  <span>{file.kindLabel}</span>
                </header>
                {file.skipped ? (
                  <p>チャット読み取りがオフのため、本文は読んでいません。</p>
                ) : (
                  <p>
                    日時のある行: {file.dataLineCount}
                    {file.chatRows ? ` (チャット: ${file.chatRows.length} 件)` : ""}
                  </p>
                )}
                {file.heldPartial && <p>末尾の未完成行は、今回の集計に入れていません。</p>}
                {file.actionCounts.length > 0 && (
                  <table>
                    <caption>アクションごとの行数</caption>
                    <thead>
                      <tr>
                        <th>アクション</th>
                        <th>行数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {file.actionCounts.map((row) => (
                        <tr key={row.action}>
                          <td>{row.action}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
