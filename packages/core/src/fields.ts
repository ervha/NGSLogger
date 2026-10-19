/**
 * タブ区切りの 1 行を列にする。
 *
 * 汎用の CSV パーサーは使わない。RewardLog とポイント系は、第3列から行末までが
 * 引用符で囲まれ、その中にタブが入る。タブで割ってから、開き引用符と閉じ引用符だけ外す。
 */

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function isTimestamp(value: string): boolean {
  return TIMESTAMP.test(value);
}

export function splitLogFields(line: string): string[] {
  const fields = line.split("\t");
  const third = fields[2];
  if (fields.length > 2 && third?.startsWith('"')) {
    fields[2] = third.slice(1);
    const lastIndex = fields.length - 1;
    const last = fields[lastIndex] ?? "";
    if (last.endsWith('"')) fields[lastIndex] = last.slice(0, -1);
  }
  return fields;
}

/** `Num(2)` や `N-Meseta(-1000)` のような付帯情報。合わなければ undefined。 */
const KEY_VALUE = /^([A-Za-z\-:]+)\((-?\d+)\)$/;

export function parseKeyValue(field: string): { key: string; value: number } | undefined {
  const matched = KEY_VALUE.exec(field.trim());
  if (!matched) return undefined;
  return { key: matched[1] ?? "", value: Number.parseInt(matched[2] ?? "", 10) };
}
