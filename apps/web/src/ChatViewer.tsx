import { useMemo, useState } from "react";
import type { ChatRow } from "@meseta/core";

interface ChatViewerProps {
  chatRows: readonly ChatRow[];
  onToggleReadChat: (enabled: boolean) => void;
  readChat: boolean;
}

export function ChatViewer({ chatRows, onToggleReadChat, readChat }: ChatViewerProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>("ALL");
  const [keyword, setKeyword] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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
        if (keyword.trim()) {
          const lower = keyword.toLowerCase();
          const matchBody = row.body.toLowerCase().includes(lower);
          const matchSender = row.characterName.toLowerCase().includes(lower);
          if (!matchBody && !matchSender) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmp = a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence;
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [chatRows, selectedChannel, keyword, sortOrder]);

  return (
    <section className="chat-viewer" aria-label="チャット履歴">
      <div className="chat-header">
        <h2>チャット履歴（遡り確認）</h2>
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
              <label htmlFor="chat-search">検索:</label>
              <input
                id="chat-search"
                type="text"
                placeholder="発言者または本文で検索..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

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
            {filtered.map((row, idx) => (
              <div
                key={`${row.timestamp}_${row.sequence}_${idx}`}
                className={`chat-item channel-${row.channel.toLowerCase()}`}
              >
                <div className="chat-meta">
                  <span className="chat-timestamp">{row.timestamp.replace("T", " ")}</span>
                  <span className="chat-channel-badge">{row.channel}</span>
                  <span className="chat-sender">{row.characterName}</span>
                </div>
                <div className="chat-body">{row.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
