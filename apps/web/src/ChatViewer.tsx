import { useMemo, useState } from "react";
import type { ChatRow } from "@meseta/core";
import { exportChatRowsCsv } from "./exportCsv.ts";

interface ChatViewerProps {
  chatRows: readonly ChatRow[];
  onToggleReadChat: (enabled: boolean) => void;
  readChat: boolean;
}

function renderHighlightedText(text: string, highlightKeywords: readonly string[]) {
  if (highlightKeywords.length === 0) return text;
  const escaped = highlightKeywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return text;

  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="chat-highlight-mark">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function ChatViewer({ chatRows, onToggleReadChat, readChat }: ChatViewerProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>("ALL");
  const [keyword, setKeyword] = useState<string>("");
  const [onlyHighlighted, setOnlyHighlighted] = useState<boolean>(false);
  const [highlightWord, setHighlightWord] = useState<string>(() => {
    try {
      return localStorage.getItem("meseta_chat_highlight") ?? "";
    } catch {
      return "";
    }
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const highlightList = useMemo(() => {
    return highlightWord
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [highlightWord]);

  const handleHighlightChange = (val: string) => {
    setHighlightWord(val);
    try {
      localStorage.setItem("meseta_chat_highlight", val);
    } catch {
      // ignore
    }
  };

  const channels = useMemo(() => {
    const set = new Set<string>();
    for (const row of chatRows) {
      if (row.channel) set.add(row.channel);
    }
    return ["ALL", ...Array.from(set).sort()];
  }, [chatRows]);

  const filtered = useMemo(() => {
    return chatRows
      .filter((row) => {
        if (selectedChannel !== "ALL" && row.channel !== selectedChannel) return false;
        const lowerBody = row.body.toLowerCase();
        const lowerSender = row.characterName.toLowerCase();

        if (onlyHighlighted && highlightList.length > 0) {
          const matchHl = highlightList.some(
            (hl) => lowerBody.includes(hl.toLowerCase()) || lowerSender.includes(hl.toLowerCase()),
          );
          if (!matchHl) return false;
        }

        if (keyword.trim()) {
          const lower = keyword.toLowerCase();
          const matchBody = lowerBody.includes(lower);
          const matchSender = lowerSender.includes(lower);
          if (!matchBody && !matchSender) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmp = a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence;
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [chatRows, selectedChannel, keyword, onlyHighlighted, highlightList, sortOrder]);

  return (
    <section className="chat-viewer" aria-label="チャット履歴">
      <div className="chat-header">
        <h2>チャット履歴（遡り確認）</h2>
        <div className="chat-header-actions">
          {readChat && chatRows.length > 0 && (
            <button
              type="button"
              className="secondary-button compact-btn"
              onClick={() => exportChatRowsCsv(chatRows)}
              title="チャットログを CSV でダウンロード"
            >
              💬 チャットCSV
            </button>
          )}
          <div className="chat-toggle">
            <label>
              <input
                type="checkbox"
                checked={readChat}
                onChange={(e) => onToggleReadChat(e.target.checked)}
              />
              チャット読み取りを有効にする（オプトイン）
            </label>
          </div>
        </div>
      </div>

      {!readChat ? (
        <p className="hint">
          ※ 初期設定ではプライバシー保護のためチャットログの読み取りはオフになっています。
          上のチェックをオンにすると、読み込み時に ChatLog の本文を解析してここに一覧表示します。
        </p>
      ) : chatRows.length === 0 ? (
        <p className="hint">
          読み込まれたチャットログはありません。ログフォルダ内の ChatLog を読み込むと表示されます。
        </p>
      ) : (
        <>
          <div className="chat-controls">
            <div className="control-group">
              <label htmlFor="channel-select">チャンネル:</label>
              <select
                id="channel-select"
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
              >
                {channels.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch === "ALL" ? "すべて" : ch}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="chat-search">検索絞り込み:</label>
              <input
                id="chat-search"
                type="text"
                placeholder="発言者または本文で絞り込み..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="control-group">
              <label htmlFor="chat-highlight">注目ワード:</label>
              <input
                id="chat-highlight"
                type="text"
                placeholder="名前や募集ワード（カンマ区切り）"
                value={highlightWord}
                onChange={(e) => handleHighlightChange(e.target.value)}
              />
            </div>

            {highlightList.length > 0 && (
              <div className="control-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={onlyHighlighted}
                    onChange={(e) => setOnlyHighlighted(e.target.checked)}
                  />
                  ★ 注目ワードのみ
                </label>
              </div>
            )}

            <div className="control-group">
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                日時: {sortOrder === "desc" ? "新しい順 ↓" : "古い順 ↑"}
              </button>
            </div>

            <span className="count-label">
              {filtered.length} / {chatRows.length} 件
            </span>
          </div>

          <div className="chat-list" role="feed">
            {filtered.map((row, idx) => {
              const isHighlighted =
                highlightList.length > 0 &&
                highlightList.some(
                  (hl) =>
                    row.body.toLowerCase().includes(hl.toLowerCase()) ||
                    row.characterName.toLowerCase().includes(hl.toLowerCase()),
                );

              return (
                <div
                  key={`${row.timestamp}_${row.sequence}_${idx}`}
                  className={`chat-item channel-${row.channel.toLowerCase()} ${isHighlighted ? "chat-highlighted" : ""}`}
                >
                  <div className="chat-meta">
                    <span className="chat-timestamp">{row.timestamp.replace("T", " ")}</span>
                    <span className="chat-channel-badge">{row.channel}</span>
                    <span className="chat-sender">
                      {renderHighlightedText(row.characterName, highlightList)}
                    </span>
                    {isHighlighted && <span className="highlight-tag">★注目</span>}
                  </div>
                  <div className="chat-body">{renderHighlightedText(row.body, highlightList)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
