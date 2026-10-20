import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canUseDirectoryPicker, logsFromFileList, pickDirectoryWithBrowser } from "./adapters/web/logSource.ts";
import type { ReadableLog } from "./adapters/web/logSource.ts";
import { inspectLog } from "./importClient.ts";
import { ChatViewer } from "./ChatViewer.tsx";
import { exportDataAsJson, parseBackupFile } from "./exportImport.ts";
import type { ActionCountRow, ImportSuccess } from "./workers/protocol.ts";
import { buildLedger, summarizeLedger } from "@meseta/core";
import type { ActionRow, ChatRow } from "@meseta/core";
import { OFFICIAL_SITE_URL } from "./officialSite.ts";
import { buildCacheKey, getCachedParsedLog, setCachedParsedLog } from "./cache/logCache.ts";
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
const LOCAL_COMPACT_KEY = "meseta_compact_mode";

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
  const snapshotRef = useRef<string>("");

  const [files, setFiles] = useState<ImportSuccess[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [rememberNotice, setRememberNotice] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "chat" | "files">("dashboard");

  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_COMPACT_KEY) === "true";
    } catch {
      return false;
    }
  });

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

  const directoryPicker = useMemo(() => canUseDirectoryPicker(), []);

  const handleToggleCompact = (enabled: boolean) => {
    setCompact(enabled);
    try {
      localStorage.setItem(LOCAL_COMPACT_KEY, String(enabled));
    } catch {
      // ignore
    }
  };

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

  // メセタ分析データ（収支・マイショップ売却推定・セッション時給・売れ筋ランキング）
  const analytics = useMemo(() => {
    if (allActionRows.length === 0) return null;
    const ledger = buildLedger(allActionRows);
    return summarizeLedger(ledger, 0, allActionRows);
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
          // 1. サイズ既知の場合、キャッシュを事前確認
          if (typeof log.size === "number") {
            const cacheKey = buildCacheKey(log.name, log.size, readChat);
            const cached = await getCachedParsedLog(cacheKey);
            if (cached) {
              next.push(cached);
              continue;
            }
          }

          // 2. キャッシュ未ヒット時は実読み取り
          const bytes = await log.read();
          const size = log.size ?? bytes.byteLength;
          const cacheKey = buildCacheKey(log.name, size, readChat);
          const cached = await getCachedParsedLog(cacheKey);
          if (cached) {
            next.push(cached);
            continue;
          }

          const response = await inspectLog(log.name, bytes, readChat);
          if (response.ok) {
            next.push(response);
            void setCachedParsedLog(cacheKey, log.name, size, readChat, response);
          } else {
            problems.push(`${response.fileName}: ${response.message}`);
          }
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

  // リアルタイム自動監視（Tauri 版でログフォルダが指定されている場合、軽量スナップショットで更新検知）
  useEffect(() => {
    if (import.meta.env.MODE !== "tauri" || !currentFolder || !autoWatch) return;

    let mounted = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const desktop = await import("./adapters/tauri/logSource.ts");
        const snap = await desktop.getDirectorySnapshot(currentFolder);
        if (snap) {
          const snapKey = `${snap.fileCount}:${snap.totalSize}:${snap.latestFileName ?? ""}:${snap.latestFileSize ?? 0}`;
          if (snapshotRef.current && snapshotRef.current !== snapKey) {
            const logs = await desktop.scanDirectoryLogs(currentFolder);
            if (mounted && logs.length > 0) {
              await load(logs, currentFolder, true);
            }
          }
          snapshotRef.current = snapKey;
        }
      } catch {
        // ignore
      }
      if (mounted) {
        timer = window.setTimeout(poll, 4000);
      }
    };

    timer = window.setTimeout(poll, 4000);

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [currentFolder, autoWatch, load]);

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

  async function handleBackupImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = await parseBackupFile(file);
      const settings = backup.settings as { savedFolder?: string; readChat?: boolean } | undefined;
      if (settings?.savedFolder) setCurrentFolder(settings.savedFolder);
      if (typeof settings?.readChat === "boolean") handleToggleReadChat(settings.readChat);
      setFiles(backup.files);
      setErrors([]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "バックアップの復元に失敗しました";
      setErrors([msg]);
    } finally {
      event.target.value = "";
    }
  }

  // コンパクト表示（ミニウィジェット）
  if (compact) {
    const today = new Date().toISOString().slice(0, 10);
    const todaySummary = analytics?.daily.find((d) => d.date === today);
    const latestSession = analytics?.sessions[0];

    return (
      <main className="compact-widget">
        <div className="compact-header">
          <span className="compact-title">メセタ帳 ミニ</span>
          <button
            type="button"
            className="compact-expand-btn"
            onClick={() => handleToggleCompact(false)}
            title="通常表示に戻す"
          >
            🗖 通常画面
          </button>
        </div>

        <div className="compact-body">
          <div className="compact-kpi">
            <span className="compact-label">当日純利益 ({today})</span>
            <span
              className={`compact-val ${
                todaySummary ? (todaySummary.net >= 0 ? "positive" : "negative") : "neutral"
              }`}
            >
              {todaySummary ? (todaySummary.net > 0 ? "+" : "") : ""}
              {(todaySummary?.net ?? 0).toLocaleString()} <small>N-メセタ</small>
            </span>
          </div>

          <div className="compact-kpi-sub">
            <span>収入: +{(todaySummary?.income ?? 0).toLocaleString()}</span>
            <span>支出: -{(todaySummary?.expense ?? 0).toLocaleString()}</span>
          </div>

          {latestSession && (
            <div className="compact-session">
              <span className="compact-session-label">直近セッション時給</span>
              <span className={`compact-session-val ${latestSession.hourlyNet >= 0 ? "positive" : "negative"}`}>
                {latestSession.hourlyNet > 0 ? "+" : ""}
                {latestSession.hourlyNet.toLocaleString()} N-メセタ/h
              </span>
              <span className="compact-session-time">
                ({latestSession.durationMinutes}分間プレイ / 純利: {latestSession.net > 0 ? "+" : ""}
                {latestSession.net.toLocaleString()})
              </span>
            </div>
          )}

          {currentFolder && (
            <div className="compact-status">
              <span className="status-dot online" />
              <span>{autoWatch ? "リアルタイム監視中" : "監視停止中"}</span>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main
      className="container"
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
          {/* バックアップ・エクスポート・ミニ表示操作 */}
          <div className="backup-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleToggleCompact(true)}
              title="ゲームプレイ中に便利なコンパクト表示モードに切り替えます"
            >
              🗗 ミニ表示
            </button>
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
          <a
            href={OFFICIAL_SITE_URL}
            onClick={(event) => {
              if (import.meta.env.MODE !== "tauri") return;
              event.preventDefault();
              void import("./adapters/tauri/openOfficialSite.ts").then((mod) =>
                mod.openOfficialSite(),
              );
            }}
            onAuxClick={(event) => {
              if (import.meta.env.MODE !== "tauri") return;
              event.preventDefault();
              void import("./adapters/tauri/openOfficialSite.ts").then((mod) =>
                mod.openOfficialSite(),
              );
            }}
          >
            公式サイト
          </a>
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
              : "フォルダ選択からログフォルダ（ドキュメント\\SEGA\\PHANTASYSTARONLINE2\\log_ngs）を選んでください。"}
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
          📊 メセタ収支・プレイ分析
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

      {/* タブコンテンツ */}
      {activeTab === "dashboard" && (
        <>
          {analytics ? (
            <Suspense fallback={<p className="loading">ダッシュボードを読み込み中…</p>}>
              <MesetaDashboard analytics={analytics} />
            </Suspense>
          ) : (
            <section className="empty-dashboard">
              <p>ログファイルを読み込むと、ここにメセタ収支やマイショップ売却推移が表示されます。</p>
            </section>
          )}

          {actionFiles > 0 && (
            <Suspense fallback={<p className="loading">グラフを準備中…</p>}>
              <ActionChart counts={counts} />
            </Suspense>
          )}
        </>
      )}

      {activeTab === "chat" && (
        <ChatViewer
          chatRows={allChatRows}
          readChat={readChat}
          onToggleReadChat={handleToggleReadChat}
        />
      )}

      {activeTab === "files" && (
        <section className="summary" aria-label="読み込み結果">
          <h2>読み込みファイル一覧</h2>
          <table>
            <thead>
              <tr>
                <th>ファイル名</th>
                <th>種類</th>
                <th>行数</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.fileName}>
                  <td>{file.fileName}</td>
                  <td>{file.kind}</td>
                  <td>{file.dataLineCount}</td>
                  <td>{file.skipped ? "集計対象外（スキップ）" : "解析完了"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
