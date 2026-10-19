/**
 * @meseta/core
 *
 * ログの読み取りと集計のうち、画面にも OS にも依存しない部分。
 * 入力はバイト列か文字列、出力はただのオブジェクト。Dart でいう「Flutter を import しないライブラリ」に当たる。
 */

export {
  LogChunkDecoder,
  LogLineReader,
  decodeLogBytes,
  splitLogLines,
} from "./decode.ts";
export type { DecodeResult, LogEncoding, SplitLines } from "./decode.ts";

export { LOG_KIND_LABEL, detectLogBytes, detectLogText } from "./detect.ts";
export type { DetectOptions, DetectResult, LogKind } from "./detect.ts";

export { isTimestamp, parseKeyValue, splitLogFields } from "./fields.ts";

export { countActions, parseActionLine, parseActionLines, parseActionLog } from "./parseAction.ts";
export type { ActionCount, ActionRow } from "./parseAction.ts";

export {
  isSymbolChat,
  parseChatLine,
  parseChatLines,
  parseChatLog,
} from "./parseChat.ts";
export type { ChatChannel, ChatRow } from "./parseChat.ts";

export {
  DEFAULT_FEE_RATE,
  MAX_OPEN_LISTINGS,
  buildLedger,
  normalizeItemName,
} from "./estimateSales.ts";
export type {
  ActionLedger,
  Exchange,
  Listing,
  ListingStatus,
  NpcPurchase,
  SaleCandidate,
  SaleMatch,
  ShopPurchase,
  ShopTake,
  ShopWithdraw,
} from "./estimateSales.ts";

export {
  getBoundaryDate,
  summarizeLedger,
} from "./ledgerSummary.ts";
export type {
  DailySummary,
  LedgerAnalytics,
  ShopSummary,
} from "./ledgerSummary.ts";
