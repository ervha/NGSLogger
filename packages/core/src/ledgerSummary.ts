/**
 * ActionLedger から日別収支やマイショップ売却サマリー、セッション時給、売れ筋ランキングを集計する。
 */

import type { ActionLedger } from "./estimateSales.ts";
import type { ActionRow } from "./parseAction.ts";

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

export interface PlaySession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  income: number;
  expense: number;
  net: number;
  hourlyNet: number;
  hourlyIncome: number;
  actionCount: number;
}

export interface ItemSalesRanking {
  itemName: string;
  totalQuantity: number;
  totalGross: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
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
  sessions: PlaySession[];
  itemRankings: ItemSalesRanking[];
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

function parseTimestampMs(ts: string): number {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getMesetaAmount(row: ActionRow): number {
  const val = row.values["N-Meseta"] ?? row.values["Meseta"];
  return typeof val === "number" ? Math.abs(val) : 0;
}

/**
 * アクション行からプレイセッションを推定・集計する。
 * 行の間隔が gapThresholdMinutes（既定30分）を超えたら新セッションとする。
 */
export function buildPlaySessions(
  rows: readonly ActionRow[],
  gapThresholdMinutes = 30,
): PlaySession[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const gapMs = gapThresholdMinutes * 60 * 1000;
  const sessions: PlaySession[] = [];

  let currentStart = sorted[0]?.timestamp ?? "";
  let currentEnd = sorted[0]?.timestamp ?? "";
  let currentStartMs = parseTimestampMs(currentStart);
  let currentEndMs = currentStartMs;
  let income = 0;
  let expense = 0;
  let actionCount = 0;

  function pushCurrent() {
    const durationMinutes = Math.max(1, Math.round((currentEndMs - currentStartMs) / 60000));
    const hours = durationMinutes / 60;
    const net = income - expense;
    sessions.push({
      id: `${currentStart}_${currentEnd}`,
      startTime: currentStart,
      endTime: currentEnd,
      durationMinutes,
      income,
      expense,
      net,
      hourlyNet: Math.round(net / hours),
      hourlyIncome: Math.round(income / hours),
      actionCount,
    });
  }

  for (const row of sorted) {
    const rowMs = parseTimestampMs(row.timestamp);
    if (rowMs - currentEndMs > gapMs) {
      pushCurrent();
      currentStart = row.timestamp;
      currentStartMs = rowMs;
      income = 0;
      expense = 0;
      actionCount = 0;
    }

    currentEnd = row.timestamp;
    currentEndMs = rowMs;
    actionCount += 1;

    const amount = getMesetaAmount(row);
    if (
      row.action === "[ShopTakes]" ||
      row.action === "[ExchangeItem]" ||
      row.action === "[DiscradExchange]"
    ) {
      income += amount;
    } else if (
      row.action === "[ShopBuy]" ||
      row.action === "[BuyItem]" ||
      row.action === "[ProduceItem]"
    ) {
      expense += amount;
    }
  }

  pushCurrent();
  return sessions.reverse(); // 直近セッションを上に
}

/**
 * マイショップ推定売却ログから売れ筋アイテムを集計・ランキング化する。
 */
export function rankSoldItems(ledger: ActionLedger): ItemSalesRanking[] {
  const map = new Map<
    string,
    { quantity: number; totalGross: number; minPrice: number; maxPrice: number }
  >();

  for (const match of ledger.saleMatches) {
    const items =
      match.candidates.length === 1
        ? match.candidates[0]
        : match.commonItems.length > 0
          ? match.commonItems
          : undefined;

    if (!items) continue;

    for (const item of items) {
      let stat = map.get(item.itemName);
      if (!stat) {
        stat = {
          quantity: 0,
          totalGross: 0,
          minPrice: item.price,
          maxPrice: item.price,
        };
        map.set(item.itemName, stat);
      }
      stat.quantity += 1;
      stat.totalGross += item.price;
      if (item.price < stat.minPrice) stat.minPrice = item.price;
      if (item.price > stat.maxPrice) stat.maxPrice = item.price;
    }
  }

  const result: ItemSalesRanking[] = [];
  for (const [itemName, stat] of map.entries()) {
    result.push({
      itemName,
      totalQuantity: stat.quantity,
      totalGross: stat.totalGross,
      averagePrice: Math.round(stat.totalGross / stat.quantity),
      minPrice: stat.minPrice,
      maxPrice: stat.maxPrice,
    });
  }

  // 総売上額降順（同額なら販売数降順）
  return result.sort((a, b) => b.totalGross - a.totalGross || b.totalQuantity - a.totalQuantity);
}

export function summarizeLedger(
  ledger: ActionLedger,
  dayBoundaryHour = 0,
  rawRows?: readonly ActionRow[],
): LedgerAnalytics {
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
      gross: m.gross,
      items,
      isCertain: m.candidates.length === 1 || m.commonItems.length > 0,
    };
  });

  const sessions = rawRows ? buildPlaySessions(rawRows) : [];
  const itemRankings = rankSoldItems(ledger);

  return {
    daily,
    shopSummary,
    totalIncome,
    totalExpense,
    totalNet: totalIncome - totalExpense,
    recentSales,
    sessions,
    itemRankings,
  };
}
