import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { canUseDirectoryPicker, logsFromFileList, pickDirectoryWithBrowser } from "./adapters/web/logSource.ts";
import type { ReadableLog } from "./adapters/web/logSource.ts";
import { inspectLog } from "./importClient.ts";

const ActionChart = lazy(() =>
  import("./ActionChart.tsx").then((mod) => ({ default: mod.ActionChart })),
);
import type { ActionCountRow, ImportSuccess } from "./workers/protocol.ts";
import "./App.css";

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
  const directoryPicker = canUseDirectoryPicker();

  useEffect(() => {
    // React の型には webkitdirectory が無いブラウザ向け属性。DOM へ直接付ける。
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);
  const counts = useMemo(() => mergeCounts(files), [files]);
  const actionFiles = files.filter((file) => file.kind === "ActionLog" && !file.skipped).length;

  async function load(logs: readonly ReadableLog[]) {
    if (logs.length === 0) return;
    setBusy(true);
    setErrors([]);
    setFiles([]);
    const next: ImportSuccess[] = [];
    const problems: string[] = [];
    for (let index = 0; index < logs.length; index += 1) {
      const log = logs[index];
      if (!log) continue;
      setProgress(`${index + 1} / ${logs.length} ファイル`);
      try {
        const bytes = await log.read();
        const response = await inspectLog(log.name, bytes);
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
  }

  async function chooseDirectory() {
    if (import.meta.env.MODE === "tauri") {
      const desktop = await import("./adapters/tauri/logSource.ts");
      await load(await desktop.pickTauriLogs("directory"));
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
          公式ログをこのブラウザの中だけで読み、ActionLog の行数を数えます。サーバーには送りません。
        </p>
      </header>

      <section className="notice" aria-label="このツールについて">
        <p>本ツールは非公式のファンメイドツールです。株式会社セガとは関係ありません。</p>
        <p>
          PHANTASY STAR ONLINE 2 NEW GENESIS （C）SEGA ／{" "}
          <a href="https://pso2.jp/players/">公式サイト</a>
        </p>
        <p>チャット系のログは種別の判定だけして、本文は読みません。</p>
      </section>

      <section className="panel">
        <div className="actions">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            ファイルを選ぶ
          </button>
          <button type="button" onClick={() => void chooseDirectory()} disabled={busy}>
            フォルダを選ぶ
          </button>
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
        <p className="hint">
          {directoryPicker
            ? "このブラウザはフォルダを直接選べます。ファイルをこの画面へドロップしても読めます。"
            : "このブラウザはフォルダの直接選択に対応していないため、フォルダ選択ではファイル一覧の入力を使います。"}
          ログの場所の目安は「ドキュメント\SEGA\PHANTASYSTARONLINE2\log」です。
        </p>
        {busy && <p className="progress">{progress || "読み込んでいます…"}</p>}
      </section>

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
                  <p>チャット系のため、本文は読んでいません。</p>
                ) : (
                  <p>日時のある行: {file.dataLineCount}</p>
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
