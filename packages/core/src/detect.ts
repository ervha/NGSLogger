/**
 * ファイルの中身からログ種別を決める。ファイル名は見ない。
 *
 * チャット系は先頭数行の第3列（チャンネル名）で判断する。
 * readChat が false（既定）の場合は、そこで読み進めるのをやめ、本文を保持しない。
 * readChat が true の場合は、skipBody: false として本文の解析を許可する。
 */

import { decodeLogBytes } from "./decode.ts";

export type LogKind =
  | "ActionLog"
  | "RewardLog"
  | "ScratchLog"
  | "CurrencyLog"
  | "ChatLog"
  | "SymbolChatLog"
  | "Unknown";

export interface DetectOptions {
  /** チャットログの本文を読み取るかどうか（初期値: false） */
  readChat?: boolean;
}

export interface DetectResult {
  kind: LogKind;
  /** true のときはチャット系であり本文を破棄する設定。 */
  skipBody: boolean;
}

const CHAT_CHANNELS = new Set(["PUBLIC", "PARTY", "GROUP", "CHANNEL", "REPLY", "GUILD"]);
const DATA_LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const HEX_BODY = /^[0-9a-f]{16,}$/i;
/** 種別判定で本文を覗くチャット行の上限。これを超えたら残りは読まない。 */
const CHAT_SAMPLE_LIMIT = 8;
const PREFIX_BYTES = 16 * 1024;

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  ActionLog: "ActionLog",
  RewardLog: "RewardLog",
  ScratchLog: "ScratchLog",
  CurrencyLog: "スタージェム／ポイント系（推定）",
  ChatLog: "ChatLog",
  SymbolChatLog: "SymbolChatLog（推定）",
  Unknown: "未対応の種別",
};

function column3(row: string[]): string {
  return row[2] ?? "";
}

function classify(
  rows: string[][],
  chatBodies: string[] | undefined,
  options?: DetectOptions,
): DetectResult {
  if (rows.length === 0) return { kind: "Unknown", skipBody: false };

  const thirds = rows.map(column3);
  if (thirds.some((value) => value.startsWith("[") && value.endsWith("]"))) {
    return { kind: "ActionLog", skipBody: false };
  }
  if (chatBodies) {
    const symbol =
      chatBodies.length > 0 && chatBodies.every((body) => HEX_BODY.test(body));
    const kind: LogKind = symbol ? "SymbolChatLog" : "ChatLog";
    const skipBody = options?.readChat ? false : true;
    return { kind, skipBody };
  }
  if (
    thirds.some(
      (value) =>
        value === '"GetReward' ||
        value === '"BuyItem' ||
        value.startsWith('"Get') ||
        value.startsWith('"Buy'),
    )
  ) {
    return { kind: "CurrencyLog", skipBody: false };
  }
  if (thirds.every((value) => /^"\d+/.test(value))) {
    return { kind: "RewardLog", skipBody: false };
  }
  if (
    rows.some(
      (row) =>
        row.length > 3 &&
        (row[3] === "Pay" || row[3] === "Received" || row[3] === "ReceivedWarehouse"),
    )
  ) {
    return { kind: "ScratchLog", skipBody: false };
  }
  return { kind: "Unknown", skipBody: false };
}

/** デコード済みのテキストから種別を決める。 */
export function detectLogText(text: string, options?: DetectOptions): DetectResult {
  const rows: string[][] = [];
  let chatBodies: string[] | undefined;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line || !DATA_LINE.test(line)) continue;
    const cols = line.split("\t");
    const channel = column3(cols);
    if (CHAT_CHANNELS.has(channel)) {
      chatBodies ??= [];
      if (chatBodies.length < CHAT_SAMPLE_LIMIT && cols.length > 5) {
        chatBodies.push(cols[5] ?? "");
      }
      if (chatBodies.length >= CHAT_SAMPLE_LIMIT && !options?.readChat) break;
      rows.push(cols);
      continue;
    }
    // チャットと分かったあとの行は見ない。混在ファイルは想定していない。
    if (chatBodies && !options?.readChat) break;
    rows.push(cols);
  }

  return classify(rows, chatBodies, options);
}

function prefixLength(bytes: Uint8Array): number {
  if (bytes.length <= PREFIX_BYTES) return bytes.length;
  let end = PREFIX_BYTES;
  const looksUtf16 =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff) ||
    bytes[1] === 0x00;
  if (looksUtf16 && end % 2 !== 0) end -= 1;
  return end;
}

/**
 * バイト列から種別を決める。
 * readChat が false の場合、チャット系は先頭だけをデコードし、ファイル全体は文字列にしない。
 */
export function detectLogBytes(bytes: Uint8Array, options?: DetectOptions): DetectResult {
  if (options?.readChat) {
    // チャット読み取り有効時は全体をデコードして種別と内容を確認
    return detectLogText(decodeLogBytes(bytes).text, options);
  }
  const head = bytes.subarray(0, prefixLength(bytes));
  const detected = detectLogText(decodeLogBytes(head).text, options);
  if (detected.skipBody || detected.kind !== "Unknown" || head.length === bytes.length) {
    return detected;
  }
  return detectLogText(decodeLogBytes(bytes).text, options);
}
