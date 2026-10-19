/**
 * ActionLog の 1 行をオブジェクトにする。
 *
 * 基本の列: 日時、通番、[アクション]、キャラID、キャラ名、アイテム名、付帯情報…
 * キャラIDとキャラ名は位置を数えるためだけに使い、戻り値には入れない
 * （保存・表示しない方針。画面ではユーザーが付ける表示名を使う）。
 *
 * [DisplayToShop-SetValue] だけ ID と名前の列が無く、アイテム名が第4列にずれる。
 * メセタが動く操作は「アイテム行」と「アイテム名が空の金額行」の 2 行 1 組。
 */

import { splitLogLines } from "./decode.ts";
import { isTimestamp, parseKeyValue, splitLogFields } from "./fields.ts";

export interface ActionRow {
  /** `YYYY-MM-DDTHH:MM:SS`。タイムゾーンは書かれていない。日本時間として扱う。 */
  timestamp: string;
  /** 同じセッション内の通番。並べ替えは（日時, 通番） */
  sequence: number;
  /** 原文のまま。換金は `[DiscradExchange]`（Discard ではない） */
  action: string;
  /** 金額行では空文字 */
  itemName: string;
  /** `Num` や `N-Meseta` など。キーはそのまま、値は整数 */
  values: Record<string, number>;
  /** `attr:NONE(0)` の `NONE(0)` 部分。無い行では undefined */
  attribute?: string;
  /** アイテム名が空で、N-Meseta がある行 */
  isMesetaLine: boolean;
  layout: "standard" | "set-value";
}

const ATTRIBUTE = /^attr:(.+)$/;
const SET_VALUE = "[DisplayToShop-SetValue]";

/** 改行まで揃った 1 行。空行や日時でない行は undefined。 */
export function parseActionLine(line: string): ActionRow | undefined {
  if (!line) return undefined;
  const fields = splitLogFields(line);
  const timestamp = fields[0] ?? "";
  if (fields.length < 3 || !isTimestamp(timestamp)) return undefined;

  const sequence = Number.parseInt(fields[1] ?? "", 10);
  if (!Number.isInteger(sequence)) return undefined;

  const action = fields[2] ?? "";
  const setValue = action === SET_VALUE;
  const itemName = (setValue ? fields[3] : fields[5]) ?? "";
  const extras = setValue ? fields.slice(4) : fields.slice(6);

  const values: Record<string, number> = {};
  let attribute: string | undefined;
  for (const extra of extras) {
    const trimmed = extra.trim();
    if (!trimmed) continue;
    const attr = ATTRIBUTE.exec(trimmed);
    if (attr) {
      attribute = attr[1];
      continue;
    }
    const pair = parseKeyValue(trimmed);
    if (pair) values[pair.key] = pair.value;
  }

  return {
    timestamp,
    sequence,
    action,
    itemName,
    values,
    attribute,
    isMesetaLine: itemName === "" && Object.hasOwn(values, "N-Meseta"),
    layout: setValue ? "set-value" : "standard",
  };
}

export function parseActionLines(lines: readonly string[]): ActionRow[] {
  const rows: ActionRow[] = [];
  for (const line of lines) {
    const row = parseActionLine(line);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * テキスト全体をパースする。
 * 末尾が改行で終わっていない最後の行は `heldPartial` になり、行には含めない。
 */
export function parseActionLog(text: string): { rows: ActionRow[]; heldPartial: boolean } {
  const split = splitLogLines(text);
  return {
    rows: parseActionLines(split.lines),
    heldPartial: split.partial.length > 0,
  };
}

export interface ActionCount {
  action: string;
  count: number;
}

/** アクション文字列ごとの行数。金額行も 1 行として数える。 */
export function countActions(rows: readonly ActionRow[]): ActionCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action, "ja"));
}
