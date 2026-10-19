import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeLogBytes } from "../src/decode.ts";
import { detectLogBytes } from "../src/detect.ts";
import { buildLedger } from "../src/estimateSales.ts";
import { parseActionLog } from "../src/parseAction.ts";
import {
  actionLines,
  asLogText,
  currencyLines,
  encodeUtf16Le,
  rewardLines,
  scratchLines,
} from "./sampleLines.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(repoRoot, "fixtures/logs", name)));
}

describe("合成フィクスチャ", () => {
  it("UTF-16LE BOM + CRLF のファイルが、ソースの行と一致する", () => {
    const expected = encodeUtf16Le(asLogText(actionLines));
    expect(Buffer.from(readFixture("action-sample.txt"))).toEqual(Buffer.from(expected));
    expect(Buffer.from(readFixture("reward-sample.txt"))).toEqual(
      Buffer.from(encodeUtf16Le(asLogText(rewardLines))),
    );
    expect(Buffer.from(readFixture("scratch-sample.txt"))).toEqual(
      Buffer.from(encodeUtf16Le(asLogText(scratchLines))),
    );
    expect(Buffer.from(readFixture("currency-sample.txt"))).toEqual(
      Buffer.from(encodeUtf16Le(asLogText(currencyLines))),
    );
  });

  it("ファイルをデコードすると ActionLog になり、キャラ名はパース結果に残らない", () => {
    const bytes = readFixture("action-sample.txt");
    expect(detectLogBytes(bytes).kind).toBe("ActionLog");
    const decoded = decodeLogBytes(bytes);
    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.hadBom).toBe(true);
    const parsed = parseActionLog(decoded.text);
    expect(parsed.heldPartial).toBe(false);
    expect(parsed.rows).toHaveLength(actionLines.length);
    expect(JSON.stringify(parsed.rows).includes("テストキャラ")).toBe(false);
    expect(JSON.stringify(parsed.rows).includes("00000000")).toBe(false);
  });
});

describe("マイショップ台帳（合成データ）", () => {
  const ledger = buildLedger(parseActionLog(asLogText(actionLines)).rows);

  it("マイショップ購入は支払額がそのまま残る", () => {
    expect(ledger.userShopPurchases).toEqual([
      {
        timestamp: "2026-10-12T20:57:34",
        itemName: "サンプルロッド",
        quantity: 1,
        price: 1_000_000,
        unitPrice: 1_000_000,
      },
    ]);
  });

  it("NPC 購入の支払額は直前の所持額との差分", () => {
    expect(ledger.npcPurchases).toEqual([
      {
        timestamp: "2026-10-11T20:40:17",
        itemName: "サンプルインテグラ",
        quantity: 1,
        price: 50_000,
      },
      {
        timestamp: "2026-10-11T20:40:27",
        itemName: "サンプルキューブ",
        quantity: 1,
        price: 50_000,
      },
    ]);
    expect(ledger.npcPurchasesOther).toEqual([
      {
        timestamp: "2026-10-11T20:41:00",
        itemName: "サンプル交換素材",
        quantity: 800,
        price: undefined,
      },
    ]);
  });

  it("換金と拾得メセタを集計する", () => {
    expect(ledger.exchanges).toEqual([{ timestamp: "2026-10-12T00:02:02", amount: 209_245 }]);
    expect(ledger.pickupMeseta).toBe(1_500);
    expect(ledger.pickupItems).toEqual({ サンプル鉱石: 3 });
  });

  it("回収額から売れた出品を推定する", () => {
    expect(ledger.saleMatches.map((match) => match.tooMany)).toEqual([false, false, false]);
    expect(ledger.saleMatches[0]).toMatchObject({
      take: { timestamp: "2026-10-11T20:34:12", amount: 10_260_000 },
      gross: 11_400_000,
      candidates: [],
    });

    const second = ledger.saleMatches[1];
    expect(second?.take.amount).toBe(1_710_000);
    expect(second?.gross).toBe(1_900_000);
    expect(second?.candidates).toEqual([
      [
        { itemName: "サンプルアミュレット", price: 900_000 },
        { itemName: "サンプルダガー", price: 1_000_000 },
      ],
      [
        { itemName: "サンプルダガー", price: 1_000_000 },
        { itemName: "サンプルボウ", price: 900_000 },
      ],
    ]);
    expect(second?.commonItems).toEqual([{ itemName: "サンプルダガー", price: 1_000_000 }]);

    const third = ledger.saleMatches[2];
    expect(third?.candidates).toEqual([[{ itemName: "サンプルアミュレット", price: 700_000 }]]);
    const sold = ledger.listings.filter((listing) => listing.status === "sold");
    expect(sold).toEqual([
      {
        timestamp: "2026-10-12T23:28:00",
        itemName: "サンプルアミュレット",
        price: 700_000,
        status: "sold",
        closedAt: "2026-10-13T20:49:03",
      },
    ]);
  });

  it("回収より後に取り下げた出品は候補から外し、同名が複数なら特定しない", () => {
    const spear = ledger.listings.find((listing) => listing.itemName === "サンプルスピア");
    expect(spear).toMatchObject({ status: "withdrawn", closedAt: "2026-10-12T20:58:15" });
    const ambiguous = ledger.listings.filter((listing) => listing.status === "ambiguous");
    expect(ambiguous.length).toBeGreaterThan(1);
    expect(ambiguous.every((listing) => listing.itemName === "サンプルアミュレット")).toBe(true);
  });
});
