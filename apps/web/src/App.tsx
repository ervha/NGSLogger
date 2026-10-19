import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canUseDirectoryPicker, logsFromFileList, pickDirectoryWithBrowser } from "./adapters/web/logSource.ts";
import type { ReadableLog } from "./adapters/web/logSource.ts";
import { inspectLog } from "./importClient.ts";
import { ChatViewer } from "./ChatViewer.tsx";
import { exportDataAsJson, parseBackupFile } from "./exportImport.ts";
import type { ActionCountRow, ImportSuccess } from "./workers/protocol.ts";
import { buildLedger, summarizeLedger } from "@meseta/core";
import type { ActionRow, ChatRow } from "@meseta/core";
import "./App.css";

const ActionChart = lazy(() =>
  import("./ActionChart.tsx").then((mod) => ({ default: mod.ActionChart })),
);

const MesetaDashboard = lazy(() =>
  import("./MesetaDashboard.tsx").then((mod) => ({ default: mod.MesetaDashboard })),
);

const LOCAL_READ_CHAT_KEY = "meseta_read_chat";
const LOCAL_SAVED_FOLDER_KEY = "meseta_saved_log_folder";
const LOCAL_AUTO_WATCH_KEY = "meseta_auto_watch";

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
  const backupInput = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<ImportSuccess[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [rememberNotice, setRememberNotice] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "chat" | "files">("dashboard");

  const [autoWatch, setAutoWatch] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_AUTO_WATCH_KEY) !== "false";
    } catch {
      return true;
    }
  });

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
      // ignore
    }
  };

  const handleToggleAutoWatch = (enabled: boolean) => {
    setAutoWatch(enabled);
    try {
      localStorage.setItem(LOCAL_AUTO_WATCH_KEY, String(enabled));
    } catch {
      // ignore
    }
  };

  const counts = useMemo(() => mergeCounts(files), [files]);
  const actionFiles = files.filter((file) => file.kind === "ActionLog" && !file.skipped).length;

  // 全 ActionRow
  const allActionRows = useMemo<ActionRow[]>(() => {
    const rows: ActionRow[] = [];
    for (const file of files) {
      if (file.actionRows) {
        rows.push(...file.actionRows);
      }
    }
    return rows;
  }, [files]);

  // メセタ分析データ（収支・マイショップ売却推定）
  const analytics = useMemo(() => {
    if (allActionRows.length === 0) return null;
    const ledger = buildLedger(allActionRows);
    return summarizeLedger(ledger, 0);
  }, [allActionRows]);

  // 全チャット行
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
    async (logs: readonly ReadableLog[], folderPath?: string, silent = false) => {
      if (logs.length === 0) return;
      if (!silent) {
        setBusy(true);
        setErrors([]);
        setProgress("");
      }
      if (folderPath) setCurrentFolder(folderPath);

      const next: ImportSuccess[] = [];
      const problems: string[] = [];

      for (let index = 0; index < logs.length; index += 1) {
        const log = logs[index];
        if (!log) continue;
        if (!silent) setProgress(`${index + 1} / ${logs.length} ファイル`);
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
      if (!silent) {
        setErrors(problems);
        setProgress("");
        setBusy(false);
      }
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
          const remembered = await desktop.rememberedLogDirectory();
          const picked = remembered ?? localStorage.getItem(LOCAL_SAVED_FOLDER_KEY);
          // ダイアログで選んだフォルダを優先する。無いときだけ公式ログフォルダを使う。
          const saved = picked || (await desktop.officialLogDirectory());
          if (remembered) {
            try {
              localStorage.setItem(LOCAL_SAVED_FOLDER_KEY, remembered);
            } catch {
              // ignore
            }
          }
          if (saved) {
            setCurrentFolder(saved);
            const logs = await desktop.scanDirectoryLogs(saved);
            if (logs.length > 0) {
              await load(logs, saved);
            }
          }
        } catch {
          // ignore
        }
      })();
    }
  }, [load]);

  // リアルタイム自動監視（Tauri 版でログフォルダが指定されている場合、一定間隔で自動再スキャン）
  useEffect(() => {
    if (import.meta.env.MODE !== "tauri" || !currentFolder || !autoWatch) return;

    let mounted = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const desktop = await import("./adapters/tauri/logSource.ts");
        const logs = await desktop.scanDirectoryLogs(currentFolder);
        if (mounted && logs.length > 0) {
          // 既存ファイル数と異なればサイレント再読込
          if (logs.length !== files.length) {
            await load(logs, currentFolder, true);
          }
        }
      } catch {
        // ignore
      }
      if (mounted) {
        timer = window.setTimeout(poll, 6000);
      }
    };

    timer = window.setTimeout(poll, 6000);

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [currentFolder, autoWatch, files.length, load]);

  useEffect(() => {
    if (rememberNotice === 0) return;
    const timer = window.setTimeout(() => setRememberNotice(0), 8000);
    return () => window.clearTimeout(timer);
  }, [rememberNotice]);

  async function chooseDirectory() {
    if (import.meta.env.MODE === "tauri") {
      const desktop = await import("./adapters/tauri/logSource.ts");
      const res = await desktop.pickAndSaveDirectoryLogs();
      if (res.rememberFailed) setRememberNotice((count) => count + 1);
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

  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const backup = await parseBackupFile(file);
      setFiles(backup.files);
      setErrors([]);
      alert(`バックアップから ${backup.files.length} ファイルの集計データを復元しました。`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "復元に失敗しました";
      setErrors([msg]);
    }
    e.target.value = "";
  };

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
        <div className="masthead-top">
          <div>
            <p className="eyebrow">PSO2 NGS / PC</p>
            <h1>メセタ帳</h1>
          </div>
          {/* バックアップ・エクスポート操作 */}
          <div className="backup-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => exportDataAsJson(files)}
              disabled={files.length === 0}
              title="現在の集計結果と設定をJSONファイルとして保存します"
            >
              📥 バックアップ保存
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => backupInput.current?.click()}
              title="保存したバックアップJSONを読み込みます"
            >
              📤 バックアップ復元
            </button>
            <input
              ref={backupInput}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => void handleBackupImport(e)}
            />
          </div>
        </div>
        <p className="lede">
          公式ログをローカルだけで読み、メセタ収支推移・マイショップ売却推定・チャット履歴を安全に確認できます。外部サーバーへの送信は一切行いません。
        </p>
      </header>

      <section className="notice" aria-label="このツールについて">
        <p>本ツールは非公式のファンメイドツールです。株式会社セガとは関係ありません。</p>
        <p>
          PHANTASY STAR ONLINE 2 NEW GENESIS （C）SEGA ／{" "}
          <a href="https://pso2.jp/players/">公式サイト</a>
        </p>
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
              🔄 今すぐ再読み込み
            </button>
          )}

          {import.meta.env.MODE === "tauri" && currentFolder && (
            <label className="auto-watch-toggle">
              <input
                type="checkbox"
                checked={autoWatch}
                onChange={(e) => handleToggleAutoWatch(e.target.checked)}
              />
              ログ追記のリアルタイム自動監視
            </label>
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

        {rememberNotice > 0 && (
          <p className="toast" role="status">
            フォルダを記録できませんでした
          </p>
        )}

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

      {/* タブナビゲーション */}
      <nav className="tab-nav" aria-label="表示切り替え">
        <button
          type="button"
          className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          📊 メセタ収支・売却分析
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          💬 チャット履歴 {allChatRows.length > 0 && `(${allChatRows.length})`}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "files" ? "active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          📁 読み込みファイル ({files.length})
        </button>
      </nav>

      {errors.length > 0 && (
        <section className="errors" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </section>
      )}

      {/* タブコンテンツ 1: ダッシュボード */}
      {activeTab === "dashboard" && (
        <>
          {analytics ? (
            <Suspense fallback={<p className="hint">ダッシュボードを準備しています…</p>}>
              <MesetaDashboard analytics={analytics} />
            </Suspense>
          ) : (
            <section className="panel empty-state">
              <p>ログを読み込むと、ここに日別収支グラフやマイショップ売却レポートが表示されます。</p>
            </section>
          )}

          {counts.length > 0 && (
            <section className="panel">
              <h3>アクション別発生回数</h3>
              <Suspense fallback={<p className="hint">グラフを準備しています…</p>}>
                <ActionChart counts={counts} />
              </Suspense>
            </section>
          )}
        </>
      )}

      {/* タブコンテンツ 2: チャット履歴 */}
      {activeTab === "chat" && (
        <ChatViewer
          chatRows={allChatRows}
          readChat={readChat}
          onToggleReadChat={handleToggleReadChat}
        />
      )}

      {/* タブコンテンツ 3: 読み込みファイル一覧 */}
      {activeTab === "files" && (
        <section className="panel">
          <div className="summary">
            <p>
              {files.length} ファイルを読みました。ActionLog は {actionFiles} ファイル、アクション行は{" "}
              {counts.reduce((sum, row) => sum + row.count, 0)} 行です。
            </p>
            <p className="hint">メセタが動く操作は、アイテム行と金額行の 2 行で 1 組です。</p>
          </div>
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
        </section>
      )}
    </div>
  );
}
