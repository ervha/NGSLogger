import { describe, expect, it } from "vitest";
import { buildLedger, MAX_OPEN_LISTINGS } from "../src/estimateSales.ts";
import type { ActionRow } from "../src/parseAction.ts";

function makeRow(action: string, values: Record<string, number>, itemName = "", timestamp = "2026-10-15T12:00:00", seq = 1): ActionRow {
  return {
    timestamp,
    sequence: seq,
    action,
    itemName,
    values,
    isMesetaLine: "N-Meseta" in values && !itemName,
    layout: action === "[DisplayToShop-SetValue]" ? "set-value" : "standard",
  };
}

describe("売却推定（estimateSales）の拡張テスト", () => {
  it(`出品数が多くても（${MAX_OPEN_LISTINGS} 件以下）探索できる`, () => {
    const rows: ActionRow[] = [];
    let seq = 1;

    // 25 件の出品を登録（異なる価格帯）
    const prices = [
      150_000, 230_000, 340_000, 450_000, 560_000,
      670_000, 780_000, 890_000, 950_000, 1_200_000,
      1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000,
      4_000_000, 4_500_000, 5_000_000, 6_000_000, 7_000_000,
      8_000_000, 9_000_000, 10_000_000, 12_000_000, 15_000_000,
    ];

    prices.forEach((price, i) => {
      rows.push(
        makeRow(
          "[DisplayToShop-SetValue]",
          { "N-Meseta": price },
          `商品_${i + 1}`,
          `2026-10-15T10:00:${i.toString().padStart(2, "0")}`,
          seq++,
        ),
      );
    });

    // 商品_1 (150,000) と 商品_2 (230,000) の合計 380,000 の回収 (10%引きで 342,000)
    // 380,000 * 0.9 = 342,000
    rows.push(
      makeRow(
        "[TakeFromShop]",
        { "N-Meseta": 342_000 },
        "",
        "2026-10-15T11:00:00",
        seq++,
      ),
    );

    const ledger = buildLedger(rows);
    expect(ledger.saleMatches).toHaveLength(1);
    const match = ledger.saleMatches[0];
    expect(match?.tooMany).toBe(false);
    expect(match?.candidates).toHaveLength(1);
    expect(match?.candidates[0]).toEqual([
      { itemName: "商品_1", price: 150_000 },
      { itemName: "商品_2", price: 230_000 },
    ]);
  });

  it("一意の組み合わせの場合、出品ステータスが sold に更新される", () => {
    const rows: ActionRow[] = [
      makeRow("[DisplayToShop-SetValue]", { "N-Meseta": 500_000 }, "ユニーク商品A", "2026-10-15T10:00:00", 1),
      makeRow("[DisplayToShop-SetValue]", { "N-Meseta": 1_234_567 }, "ユニーク商品B", "2026-10-15T10:01:00", 2),
      // 1_234_567 * 0.9 = 1_111_110.3 -> 1_111_110
      makeRow("[TakeFromShop]", { "N-Meseta": 1_111_110 }, "", "2026-10-15T11:00:00", 3),
    ];

    const ledger = buildLedger(rows);
    expect(ledger.saleMatches).toHaveLength(1);
    const match = ledger.saleMatches[0];
    expect(match?.candidates).toEqual([[{ itemName: "ユニーク商品B", price: 1_234_567 }]]);
    expect(match?.commonItems).toEqual([{ itemName: "ユニーク商品B", price: 1_234_567 }]);

    const sold = ledger.listings.find((l) => l.itemName === "ユニーク商品B");
    expect(sold?.status).toBe("sold");
    expect(sold?.closedAt).toBe("2026-10-15T11:00:00");
  });
});
