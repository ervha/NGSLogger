import type { LogKind } from "@meseta/core";

/** メインスレッドから Worker へ渡す 1 ファイル。バイト列の所有権は Worker に移す。 */
export interface ImportRequest {
  id: number;
  fileName: string;
  bytes: ArrayBuffer;
}

export interface ActionCountRow {
  action: string;
  count: number;
}

export interface ImportSuccess {
  id: number;
  ok: true;
  fileName: string;
  kind: LogKind;
  kindLabel: string;
  /** チャット系。本文は数えていない */
  skipped: boolean;
  dataLineCount: number;
  /** 末尾が改行で終わっておらず、最後の行を次回に回した */
  heldPartial: boolean;
  actionCounts: ActionCountRow[];
}

export interface ImportFailure {
  id: number;
  ok: false;
  fileName: string;
  message: string;
}

export type ImportResponse = ImportSuccess | ImportFailure;
