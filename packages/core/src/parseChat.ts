/**
 * ChatLog の 1 行をオブジェクトにする。
 *
 * 列の構造:
 * 日時 \t 通番 \t チャンネル \t キャラID \t キャラ名 \t 本文
 *
 * チャンネル: PUBLIC, PARTY, GUILD (チーム), GROUP, REPLY (ウィスパー), CHANNEL (周囲) など
 */

import { splitLogLines } from "./decode.ts";
import { isTimestamp, splitLogFields } from "./fields.ts";

export type ChatChannel =
  | "PUBLIC"
  | "PARTY"
  | "GUILD"
  | "GROUP"
  | "REPLY"
  | "CHANNEL"
  | string;

export interface ChatRow {
  /** YYYY-MM-DDTHH:MM:SS */
  timestamp: string;
  /** 同一ログ内の通番 */
  sequence: number;
  /** チャットチャンネル */
  channel: ChatChannel;
  /** キャラクターID */
  characterId: string;
  /** 発言者名 */
  characterName: string;
  /** チャット本文 */
  body: string;
}

const HEX_BODY = /^[0-9a-f]{16,}$/i;

/** 1 行をパースする */
export function parseChatLine(line: string): ChatRow | undefined {
  if (!line) return undefined;
  const cols = splitLogFields(line);
  if (cols.length < 6) return undefined;

  const timestamp = cols[0] ?? "";
  if (!isTimestamp(timestamp)) return undefined;

  const sequence = parseInt(cols[1] ?? "", 10);
  if (Number.isNaN(sequence)) return undefined;

  const channel = cols[2] ?? "";
  const characterId = cols[3] ?? "";
  const characterName = cols[4] ?? "";
  const body = cols.slice(5).join("\t");

  // シンボルチャット（16進数ハッシュのみ）は本文としては除外するか判別可能
  return {
    timestamp,
    sequence,
    channel,
    characterId,
    characterName,
    body,
  };
}

/** 複数行をパースする */
export function parseChatLines(lines: readonly string[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const line of lines) {
    const row = parseChatLine(line);
    if (row) rows.push(row);
  }
  return rows;
}

/** テキスト全体をパースする */
export function parseChatLog(text: string): { rows: ChatRow[]; heldPartial: boolean } {
  const split = splitLogLines(text);
  return {
    rows: parseChatLines(split.lines),
    heldPartial: split.partial.length > 0,
  };
}

/** シンボルチャットかどうか判定する */
export function isSymbolChat(row: ChatRow): boolean {
  return HEX_BODY.test(row.body.trim());
}
