import type { ChatRow, DailySummary, ItemSalesRanking, PlaySession } from "@meseta/core";

function escapeCsvCell(cell: string | number | undefined | null): string {
  if (cell === undefined || cell === null) return "";
  const str = String(cell);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  // Excel で日本語が文字化けしないよう UTF-8 BOM を付加
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const csvContent = rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportDailySummaryCsv(daily: readonly DailySummary[]): void {
  const header = [
    "日付",
    "収入(N-メセタ)",
    "支出(N-メセタ)",
    "純利益(N-メセタ)",
    "ショップ売上回収",
    "換金・拾得",
    "ショップ購入",
    "NPC購入",
  ];
  const rows = daily.map((d) => [
    d.date,
    d.income,
    d.expense,
    d.net,
    d.breakdown.shopTakes,
    d.breakdown.exchanges,
    d.breakdown.shopPurchases,
    d.breakdown.npcPurchases,
  ]);
  downloadCsv(`ngs_daily_ledger_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
}

export function exportSessionsCsv(sessions: readonly PlaySession[]): void {
  const header = [
    "開始日時",
    "終了日時",
    "プレイ時間(分)",
    "収入(N-メセタ)",
    "支出(N-メセタ)",
    "純利益(N-メセタ)",
    "時給(Net/h)",
    "アクション数",
  ];
  const rows = sessions.map((s) => [
    s.startTime,
    s.endTime,
    s.durationMinutes,
    s.income,
    s.expense,
    s.net,
    s.hourlyNet,
    s.actionCount,
  ]);
  downloadCsv(`ngs_sessions_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
}

export function exportItemRankingsCsv(rankings: readonly ItemSalesRanking[]): void {
  const header = [
    "アイテム名",
    "販売個数",
    "総売上額(N-メセタ)",
    "平均単価",
    "最低単価",
    "最高単価",
  ];
  const rows = rankings.map((r) => [
    r.itemName,
    r.totalQuantity,
    r.totalGross,
    r.averagePrice,
    r.minPrice,
    r.maxPrice,
  ]);
  downloadCsv(`ngs_sales_ranking_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
}

export function exportChatRowsCsv(chatRows: readonly ChatRow[]): void {
  const header = ["日時", "チャンネル", "発言者", "発言内容"];
  const rows = chatRows.map((c) => [c.timestamp, c.channel, c.characterName, c.body]);
  downloadCsv(`ngs_chat_history_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
}
