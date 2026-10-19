/**
 * 読み込みの本体。画面のスレッドを止めないように、デコードとパースはここで行う。
 * ログの中身は原則画面へ返さないが、集計およびチャット履歴表示に必要な構造化データのみを返却する。
 */

import {
  LOG_KIND_LABEL,
  LogLineReader,
  detectLogBytes,
  parseActionLines,
  countActions,
  parseChatLines,
} from "@meseta/core";
import type { ImportRequest, ImportResponse } from "./protocol.ts";

function fail(id: number, fileName: string, message: string): ImportResponse {
  return { id, ok: false, fileName, message };
}

self.onmessage = (event: MessageEvent<ImportRequest>) => {
  const { id, fileName, bytes, readChat } = event.data;
  try {
    const data = new Uint8Array(bytes);
    const detected = detectLogBytes(data, { readChat });

    if (detected.skipBody) {
      const response: ImportResponse = {
        id,
        ok: true,
        fileName,
        kind: detected.kind,
        kindLabel: LOG_KIND_LABEL[detected.kind],
        skipped: true,
        dataLineCount: 0,
        heldPartial: false,
        actionCounts: [],
      };
      self.postMessage(response);
      return;
    }

    const reader = new LogLineReader();
    const lines = reader.push(data);
    const done = reader.finish();
    const complete = [...lines, ...done.lines];
    const dataLines = complete.filter((line) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line),
    );

    const actionRows = detected.kind === "ActionLog" ? parseActionLines(dataLines) : undefined;
    const actionCounts = actionRows ? countActions(actionRows) : [];

    const chatRows =
      readChat && (detected.kind === "ChatLog" || detected.kind === "SymbolChatLog")
        ? parseChatLines(dataLines)
        : undefined;

    const response: ImportResponse = {
      id,
      ok: true,
      fileName,
      kind: detected.kind,
      kindLabel: LOG_KIND_LABEL[detected.kind],
      skipped: false,
      dataLineCount: dataLines.length,
      heldPartial: done.held.length > 0,
      actionCounts,
      actionRows,
      chatRows,
    };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "読み込みに失敗しました";
    self.postMessage(fail(id, fileName, message));
  }
};
