/**
 * ActionLog から仕入れ・出品・回収をまとめ、回収額から売れた出品を推定する。
 *
 * 売れたこと自体はログに残らない。残るのは `[TakeFromShop]` の回収額（手数料を引いた後）だけ。
 * 試作スクリプトと同じく、出品価格の組み合わせ × (1 − 手数料率) が回収額と一致するものを探す。
 * 候補が 1 通りなら、その出品を売却（推定）にする。複数なら自動では確定しない。
 * すべての候補に共通する品は `commonItems` に入れる（画面で「推定・確実」と出すため）。
 *
 * 出品数が多い場合でも、金額の上下限を用いた枝刈り探索（0-1 部分和問題）により、
 * マイショップ枠（最大40枠）の組み合わせを高速に特定する。
 */

import type { ActionRow } from "./parseAction.ts";

export const DEFAULT_FEE_RATE = 0.1;
/** マイショップ最大出品枠（40件）をカバー */
export const MAX_OPEN_LISTINGS = 40;
/** 探索ステップの安全上限 */
const MAX_SEARCH_STEPS = 50_000;
/** 保持する解の最大件数 */
const MAX_SOLUTIONS = 100;

export type ListingStatus = "open" | "withdrawn" | "sold" | "ambiguous";

export interface ShopPurchase {
  timestamp: string;
  itemName: string;
  quantity: number;
  price: number;
  unitPrice: number;
}

export interface NpcPurchase {
  timestamp: string;
  itemName: string;
  quantity: number;
  /** 所持額の差分。金額行の N-Meseta が 0 でないときはその絶対値 */
  price: number | undefined;
}

export interface Listing {
  timestamp: string;
  itemName: string;
  price: number | undefined;
  status: ListingStatus;
  closedAt?: string;
}

export interface ShopWithdraw {
  timestamp: string;
  itemName: string;
}

export interface ShopTake {
  timestamp: string;
  amount: number;
}

export interface Exchange {
  timestamp: string;
  amount: number;
}

export interface SaleCandidate {
  itemName: string;
  price: number;
}

export interface SaleMatch {
  take: ShopTake;
  /** 手数料を戻した売上。回収額 ÷ (1 − 手数料率) */
  gross: number;
  candidates: SaleCandidate[][];
  /** どの候補にも入っている出品 */
  commonItems: SaleCandidate[];
  /** 候補が多すぎて探索を中断したか */
  tooMany: boolean;
}

export interface ActionLedger {
  userShopPurchases: ShopPurchase[];
  npcPurchases: NpcPurchase[];
  /** 金額行が無い [Buy]。N-メセタ以外の交換とみなす */
  npcPurchasesOther: NpcPurchase[];
  listings: Listing[];
  withdraws: ShopWithdraw[];
  takes: ShopTake[];
  exchanges: Exchange[];
  pickupItems: Record<string, number>;
  pickupMeseta: number;
  saleMatches: SaleMatch[];
}

interface PendingItem {
  timestamp: string;
  itemName: string;
  quantity: number;
}

interface MutableListing extends Listing {
  withdrawnAt?: string;
}

/** SetValue 行は強化値（+100 など）が落ちるので、照合の前に外す。 */
export function normalizeItemName(name: string): string {
  return name.replace(/\+\d+$/, "");
}

function quantityOf(row: ActionRow): number {
  return row.values.Num ?? 1;
}

function otherCurrency(item: PendingItem): NpcPurchase {
  return {
    timestamp: item.timestamp,
    itemName: item.itemName,
    quantity: item.quantity,
    price: undefined,
  };
}

function candidateKey(items: SaleCandidate[]): string {
  return items
    .map((item) => `${item.itemName}\t${item.price}`)
    .sort((a, b) => a.localeCompare(b, "ja"))
    .join("\n");
}

function commonToAll(sets: SaleCandidate[][]): SaleCandidate[] {
  const first = sets[0];
  if (!first) return [];
  return first.filter((item) =>
    sets.every((set) =>
      set.some((other) => other.itemName === item.itemName && other.price === item.price),
    ),
  );
}

function estimateTake(
  take: ShopTake,
  listings: readonly MutableListing[],
  feeRate: number,
): SaleMatch {
  const gross = take.amount / (1 - feeRate);
  const open = listings.filter(
    (listing) =>
      listing.timestamp < take.timestamp &&
      listing.price !== undefined &&
      listing.status !== "sold" &&
      listing.withdrawnAt === undefined,
  );

  if (open.length > MAX_OPEN_LISTINGS) {
    return { take, gross, candidates: [], commonItems: [], tooMany: true };
  }

  const solutions: number[][] = [];
  const seen = new Set<string>();

  // 価格降順にソート（大きい金額から決めることで枝刈りを最大化）
  const sorted = open
    .map((listing, index) => ({
      index,
      price: listing.price ?? 0,
    }))
    .sort((a, b) => b.price - a.price);

  const n = sorted.length;
  const suffixSum = new Float64Array(n + 1);
  for (let i = n - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1] + sorted[i].price;
  }

  const minGross = (take.amount - 0.999) / (1 - feeRate);
  const maxGross = (take.amount + 0.999) / (1 - feeRate);

  let steps = 0;
  let tooMany = false;
  const selected: number[] = [];

  function dfs(idx: number, currentSum: number): void {
    if (tooMany) return;
    steps += 1;
    if (steps > MAX_SEARCH_STEPS) {
      tooMany = true;
      return;
    }

    if (currentSum >= minGross && currentSum <= maxGross && selected.length > 0) {
      const origIndexes = [...selected].sort((a, b) => a - b);
      const items = origIndexes.map((i) => ({
        itemName: open[i]?.itemName ?? "",
        price: open[i]?.price ?? 0,
      }));
      const key = candidateKey(items);
      if (!seen.has(key)) {
        seen.add(key);
        solutions.push(origIndexes);
        if (solutions.length >= MAX_SOLUTIONS) {
          tooMany = true;
          return;
        }
      }
    }

    if (idx >= n) return;
    // 残りをすべて足しても目標最小値に届かないなら枝刈り
    if (currentSum + suffixSum[idx] < minGross) return;

    for (let i = idx; i < n; i++) {
      const p = sorted[i].price;
      // この価格を足すと目標最大値を超えるならスキップ
      if (currentSum + p > maxGross) continue;

      selected.push(sorted[i].index);
      dfs(i + 1, currentSum + p);
      selected.pop();
    }
  }

  dfs(0, 0);

  // 解をアイテム数・インデックス順に整列して期待値の順序を安定化
  solutions.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
    }
    return 0;
  });

  const candidates = solutions.map((indexes) =>
    indexes.map((index) => ({
      itemName: open[index]?.itemName ?? "",
      price: open[index]?.price ?? 0,
    })),
  );

  if (solutions.length === 1) {
    for (const index of solutions[0] ?? []) {
      const listing = open[index];
      if (!listing) continue;
      listing.status = "sold";
      listing.closedAt = take.timestamp;
    }
  }

  return {
    take,
    gross,
    candidates,
    commonItems: commonToAll(candidates),
    tooMany,
  };
}

export function buildLedger(
  rows: readonly ActionRow[],
  feeRate: number = DEFAULT_FEE_RATE,
): ActionLedger {
  const ordered = [...rows].sort((a, b) =>
    a.timestamp === b.timestamp ? a.sequence - b.sequence : a.timestamp < b.timestamp ? -1 : 1,
  );

  const userShopPurchases: ShopPurchase[] = [];
  const npcPurchases: NpcPurchase[] = [];
  const npcPurchasesOther: NpcPurchase[] = [];
  const listings: MutableListing[] = [];
  const withdraws: ShopWithdraw[] = [];
  const takes: ShopTake[] = [];
  const exchanges: Exchange[] = [];
  const pickupItems: Record<string, number> = {};
  let pickupMeseta = 0;
  let carriedMeseta: number | undefined;
  let pendingUser: PendingItem | undefined;
  let pendingNpc: PendingItem | undefined;

  for (const row of ordered) {
    const mesetaLine = row.isMesetaLine;

    if (row.action === "[Buy-FromUserShop]") {
      if (!mesetaLine) {
        pendingUser = {
          timestamp: row.timestamp,
          itemName: row.itemName,
          quantity: quantityOf(row),
        };
      } else if (pendingUser) {
        const price = -(row.values["N-Meseta"] ?? 0);
        userShopPurchases.push({
          ...pendingUser,
          price,
          unitPrice: price / pendingUser.quantity,
        });
        pendingUser = undefined;
      }
    } else if (row.action === "[Buy]") {
      if (!mesetaLine) {
        if (pendingNpc) npcPurchasesOther.push(otherCurrency(pendingNpc));
        pendingNpc = {
          timestamp: row.timestamp,
          itemName: row.itemName,
          quantity: quantityOf(row),
        };
      } else if (pendingNpc) {
        const signed = row.values["N-Meseta"] ?? 0;
        const current = row.values["CurrentN-Meseta"];
        let price: number | undefined;
        if (signed !== 0) price = -signed;
        else if (carriedMeseta !== undefined && current !== undefined) price = carriedMeseta - current;
        npcPurchases.push({ ...pendingNpc, price });
        pendingNpc = undefined;
      }
    } else if (row.action === "[DisplayToShop-SetValue]") {
      listings.push({
        timestamp: row.timestamp,
        itemName: row.itemName,
        price: row.values["N-Meseta"],
        status: "open",
      });
    } else if (row.action.startsWith("[WithdrawFromShop")) {
      withdraws.push({ timestamp: row.timestamp, itemName: row.itemName });
      const same = listings.filter(
        (listing) =>
          listing.withdrawnAt === undefined &&
          listing.status !== "sold" &&
          normalizeItemName(listing.itemName) === normalizeItemName(row.itemName),
      );
      if (same.length === 1 && same[0]) {
        same[0].withdrawnAt = row.timestamp;
        same[0].status = "withdrawn";
        same[0].closedAt = row.timestamp;
      } else {
        for (const listing of same) listing.status = "ambiguous";
      }
    } else if (row.action === "[TakeFromShop]") {
      takes.push({ timestamp: row.timestamp, amount: row.values["N-Meseta"] ?? 0 });
    } else if (row.action === "[DiscradExchange]" && mesetaLine) {
      exchanges.push({ timestamp: row.timestamp, amount: row.values["N-Meseta"] ?? 0 });
    } else if (row.action === "[Pickup]") {
      if (mesetaLine) pickupMeseta += row.values["N-Meseta"] ?? 0;
      else if (row.itemName) {
        pickupItems[row.itemName] = (pickupItems[row.itemName] ?? 0) + quantityOf(row);
      }
    }

    if (row.values["CurrentN-Meseta"] !== undefined) {
      carriedMeseta = row.values["CurrentN-Meseta"];
    }
    if (row.action !== "[Buy]" && pendingNpc) {
      npcPurchasesOther.push(otherCurrency(pendingNpc));
      pendingNpc = undefined;
    }
  }
  if (pendingNpc) npcPurchasesOther.push(otherCurrency(pendingNpc));

  const saleMatches = takes.map((take) => estimateTake(take, listings, feeRate));

  return {
    userShopPurchases,
    npcPurchases,
    npcPurchasesOther,
    listings,
    withdraws,
    takes,
    exchanges,
    pickupItems,
    pickupMeseta,
    saleMatches,
  };
}
