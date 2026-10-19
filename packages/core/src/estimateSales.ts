/**
 * ActionLog から仕入れ・出品・回収をまとめ、回収額から売れた出品を推定する。
 *
 * 売れたこと自体はログに残らない。残るのは `[TakeFromShop]` の回収額（手数料を引いた後）だけ。
 * 試作スクリプトと同じく、出品価格の組み合わせ × (1 − 手数料率) が回収額と一致するものを探す。
 * 候補が 1 通りなら、その出品を売却（推定）にする。複数なら自動では確定しない。
 * すべての候補に共通する品は `commonItems` に入れる（画面で「推定・確実」と出すため）。
 *
 * 出品が多すぎると組み合わせが爆発するので、同時に見る候補が
 * {@link MAX_OPEN_LISTINGS} を超えたら推定しない。
 */

import type { ActionRow } from "./parseAction.ts";

export const DEFAULT_FEE_RATE = 0.1;
export const MAX_OPEN_LISTINGS = 12;
const MAX_COMBINATION_SIZE = 8;

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
  /** 候補が多すぎて総当たりしなかった */
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

function combinations(length: number, size: number): number[][] {
  const found: number[][] = [];
  const current: number[] = [];

  const walk = (start: number): void => {
    if (current.length === size) {
      found.push([...current]);
      return;
    }
    for (let index = start; index < length; index += 1) {
      current.push(index);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  return found;
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
  const limit = Math.min(open.length, MAX_COMBINATION_SIZE);

  for (let size = 1; size <= limit; size += 1) {
    for (const indexes of combinations(open.length, size)) {
      const total = indexes.reduce((sum, index) => sum + (open[index]?.price ?? 0), 0);
      if (Math.abs(total * (1 - feeRate) - take.amount) >= 1) continue;
      const items = indexes.map((index) => ({
        itemName: open[index]?.itemName ?? "",
        price: open[index]?.price ?? 0,
      }));
      const key = candidateKey(items);
      if (seen.has(key)) continue;
      seen.add(key);
      solutions.push(indexes);
    }
  }

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
    tooMany: false,
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
