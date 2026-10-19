/**
 * ActionLedger から日別収支やマイショップ売却サマリーを集計する。
 */

import type { ActionLedger } from "./estimateSales.ts";

export interface DailySummary {
  /** YYYY-MM-DD */
  date: string;
  /** 収入（ショップ回収 + 換金 + 拾得） */
  income: number;
  /** 支出（ショップ購入 + NPC購入） */
  expense: number;
  /** 純利益 (income - expense) */
  net: number;
  /** 内訳 */
  breakdown: {
    shopTakes: number;
    exchanges: number;
    pickup: number;
    shopPurchases: number;
    npcPurchases: number;
  };
}

export interface ShopSummary {
  totalListings: number;
  openListings: number;
  soldListings: number;
  withdrawnListings: number;
  ambiguousListings: number;
  totalIncomeTaken: number;
  totalEstimatedGross: number;
  totalFeePaid: number;
}

export interface LedgerAnalytics {
  daily: DailySummary[];
  shopSummary: ShopSummary;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  recentSales: {
    takenAt: string;
    amount: number;
    gross: number;
    items: string[];
    isCertain: boolean;
  }[];
}

/**
 * タイムスタンプ（YYYY-MM-DDTHH:MM:SS）と日替わり境界時（例: 0時または4時）から、
 * 集計対象の日付キー（YYYY-MM-DD）を算出する。
 */
export function getBoundaryDate(timestamp: string, boundaryHour = 0): string {
  const [datePart, timePart] = timestamp.split("T");
  if (!datePart) return "unknown";
  if (boundaryHour <= 0 || !timePart) return datePart;

  const [hStr] = timePart.split(":");
  const hour = parseInt(hStr ?? "0", 10);
  if (hour < boundaryHour) {
    // 前日として扱う
    const d = new Date(`${datePart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return datePart;
}

export function summarizeLedger(ledger: ActionLedger, dayBoundaryHour = 0): LedgerAnalytics {
  const dailyMap = new Map<string, DailySummary>();

  function getOrCreateDay(date: string): DailySummary {
    let day = dailyMap.get(date);
    if (!day) {
      day = {
        date,
        income: 0,
        expense: 0,
        net: 0,
        breakdown: {
          shopTakes: 0,
          exchanges: 0,
          pickup: 0,
          shopPurchases: 0,
          npcPurchases: 0,
        },
      };
      dailyMap.set(date, day);
    }
    return day;
  }

  // 1. ショップ回収
  for (const take of ledger.takes) {
    const day = getOrCreateDay(getBoundaryDate(take.timestamp, dayBoundaryHour));
    day.income += take.amount;
    day.breakdown.shopTakes += take.amount;
  }

  // 2. 換金
  for (const ex of ledger.exchanges) {
    const day = getOrCreateDay(getBoundaryDate(ex.timestamp, dayBoundaryHour));
    day.income += ex.amount;
    day.breakdown.exchanges += ex.amount;
  }

  // 3. マイショップ購入
  for (const p of ledger.userShopPurchases) {
    const day = getOrCreateDay(getBoundaryDate(p.timestamp, dayBoundaryHour));
    day.expense += p.price;
    day.breakdown.shopPurchases += p.price;
  }

  // 4. NPC 購入
  for (const p of ledger.npcPurchases) {
    if (p.price) {
      const day = getOrCreateDay(getBoundaryDate(p.timestamp, dayBoundaryHour));
      day.expense += p.price;
      day.breakdown.npcPurchases += p.price;
    }
  }

  // 各日の net を計算
  let totalIncome = 0;
  let totalExpense = 0;
  const daily: DailySummary[] = [];

  for (const day of dailyMap.values()) {
    day.net = day.income - day.expense;
    totalIncome += day.income;
    totalExpense += day.expense;
    daily.push(day);
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));

  // マイショップサマリー
  let totalIncomeTaken = 0;
  let totalEstimatedGross = 0;
  for (const match of ledger.saleMatches) {
    totalIncomeTaken += match.take.amount;
    totalEstimatedGross += match.gross;
  }

  const shopSummary: ShopSummary = {
    totalListings: ledger.listings.length,
    openListings: ledger.listings.filter((l) => l.status === "open").length,
    soldListings: ledger.listings.filter((l) => l.status === "sold").length,
    withdrawnListings: ledger.listings.filter((l) => l.status === "withdrawn").length,
    ambiguousListings: ledger.listings.filter((l) => l.status === "ambiguous").length,
    totalIncomeTaken,
    totalEstimatedGross: Math.round(totalEstimatedGross),
    totalFeePaid: Math.round(totalEstimatedGross - totalIncomeTaken),
  };

  // 売却候補・売れた商品の直近リスト
  const recentSales = ledger.saleMatches.map((m) => {
    const items =
      m.candidates.length === 1
        ? m.candidates[0]?.map((c) => `${c.itemName} (${c.price.toLocaleString()}N-メセタ)`) ?? []
        : m.commonItems.length > 0
          ? m.commonItems.map((c) => `[確実] ${c.itemName} (${c.price.toLocaleString()}N-メセタ)`)
          : [`${m.candidates.length}通りの候補あり`];

    return {
      takenAt: m.take.timestamp,
      amount: m.take.amount,
      gross: Math.round(m.gross),
      items,
      isCertain: m.candidates.length === 1 || m.commonItems.length > 0,
    };
  });

  return {
    daily,
    shopSummary,
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense,
    recentSales,
  };
}
