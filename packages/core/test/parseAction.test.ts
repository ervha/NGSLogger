import { describe, expect, it } from "vitest";
import { splitLogFields } from "../src/fields.ts";
import { countActions, parseActionLine, parseActionLog } from "../src/parseAction.ts";
import { actionLines, asLogText, rewardLines } from "./sampleLines.ts";

describe("splitLogFields", () => {
  it("第3列から行末までを包む引用符を外し、中のタブは列として残す", () => {
    const fields = splitLogFields(rewardLines[0] ?? "");
    expect(fields[2]).toBe("6");
    expect(fields[3]).toBe("テストキャラ");
    expect(fields[4]).toBe("Backpack");
    expect(fields[5]).toBe("サンプル報酬");
    expect(fields[6]).toBe("Num(1)");
  });
});

describe("parseActionLine", () => {
  it("SetValue 行はアイテム名が第4列で、強化値は付かない", () => {
    const row = parseActionLine(
      "2026-10-12T00:01:25\t111\t[DisplayToShop-SetValue]\tサンプルダガー\tattr:NONE(0)\tN-Meseta(1000000)",
    );
    expect(row).toMatchObject({
      itemName: "サンプルダガー",
      attribute: "NONE(0)",
      layout: "set-value",
      values: { "N-Meseta": 1000000 },
      isMesetaLine: false,
    });
  });

  it("通常行のキャラIDと名前は戻り値に入れない", () => {
    const row = parseActionLine(actionLines[1] ?? "");
    expect(row?.action).toBe("[Warehouse-N-Meseta]");
    expect(row?.isMesetaLine).toBe(true);
    expect(row?.values["N-Meseta"]).toBe(-1000000);
    expect(row?.values["CurrentN-Meseta"]).toBe(1000000);
    expect(row && "characterName" in row).toBe(false);
    expect(JSON.stringify(row).includes("テストキャラ")).toBe(false);
  });

  it("換金アクションはログの綴り Discrad のまま", () => {
    const row = parseActionLine(
      "2026-10-12T00:02:02\t122\t[DiscradExchange]\t00000000\tテストキャラ\t\tN-Meseta(209245)\tCurrentN-Meseta(1110745)",
    );
    expect(row?.action).toBe("[DiscradExchange]");
    expect(row?.isMesetaLine).toBe(true);
  });

  it("日時でない行は捨てる", () => {
    expect(parseActionLine("これはログではない")).toBeUndefined();
  });
});

describe("parseActionLog", () => {
  it("改行で終わらない最終行は取り込まない", () => {
    const text = asLogText(actionLines).replace(/\r\n$/, "");
    const parsed = parseActionLog(text);
    expect(parsed.heldPartial).toBe(true);
    expect(parsed.rows).toHaveLength(actionLines.length - 1);
  });

  it("アクションごとの行数を数える", () => {
    const parsed = parseActionLog(asLogText(actionLines));
    const counts = Object.fromEntries(
      countActions(parsed.rows).map((row) => [row.action, row.count]),
    );
    expect(counts["[Buy]"]).toBe(5);
    expect(counts["[Buy-FromUserShop]"]).toBe(2);
    expect(counts["[DisplayToShop]"]).toBe(8);
    expect(counts["[DisplayToShop-SetValue]"]).toBe(8);
    expect(counts["[TakeFromShop]"]).toBe(3);
    expect(counts["[DiscradExchange]"]).toBe(1);
    expect(counts["[Pickup]"]).toBe(2);
    expect(counts["[WithdrawFromShop]"]).toBe(2);
  });
});
