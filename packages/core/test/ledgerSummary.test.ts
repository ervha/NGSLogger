import { describe, expect, it } from "vitest";
import { buildLedger } from "../src/estimateSales.ts";
import {
  buildPlaySessions,
  getBoundaryDate,
  rankSoldItems,
  summarizeLedger,
} from "../src/ledgerSummary.ts";
import { parseActionLog } from "../src/parseAction.ts";
import { actionLines, asLogText } from "./sampleLines.ts";

describe("ledgerSummary", () => {
  it("getBoundaryDate で日替わり境界（4時）を判定できる", () => {
    // 4時境界の場合、3:59 は前日、4:00 は当日
    expect(getBoundaryDate("2026-10-15T03:59:59", 4)).toBe("2026-10-14");
    expect(getBoundaryDate("2026-10-15T04:00:00", 4)).toBe("2026-10-15");
    expect(getBoundaryDate("2026-10-15T23:59:59", 4)).toBe("2026-10-15");
    // 0時境界の場合
    expect(getBoundaryDate("2026-10-15T03:59:59", 0)).toBe("2026-10-15");
  });

  it("合成 ActionLog から日別収支とマイショップサマリーを集計できる", () => {
    const parsed = parseActionLog(asLogText(actionLines));
    const ledger = buildLedger(parsed.rows);
    const summary = summarizeLedger(ledger, 0, parsed.rows);

    // 収入・支出の集計
    expect(summary.totalIncome).toBeGreaterThan(0);
    expect(summary.totalExpense).toBeGreaterThan(0);
    expect(summary.daily.length).toBeGreaterThan(0);

    // 日別データの検証
    const dates = summary.daily.map((d) => d.date);
    expect(dates).toContain("2026-10-11");
    expect(dates).toContain("2026-10-12");

    // マイショップサマリー
    expect(summary.shopSummary.totalListings).toBe(ledger.listings.length);
    expect(summary.shopSummary.totalIncomeTaken).toBe(
      ledger.takes.reduce((sum, t) => sum + t.amount, 0),
    );
    expect(summary.shopSummary.totalFeePaid).toBeGreaterThan(0);

    // 売却履歴
    expect(summary.recentSales.length).toBe(ledger.saleMatches.length);
    expect(summary.recentSales[0]?.takenAt).toBe(ledger.saleMatches[0]?.take.timestamp);

    // セッション分析
    expect(summary.sessions.length).toBeGreaterThan(0);
    expect(summary.sessions[0]?.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(summary.sessions[0]?.actionCount).toBeGreaterThan(0);

    // 売れ筋ランキング
    expect(summary.itemRankings.length).toBeGreaterThanOrEqual(0);
  });

  it("buildPlaySessions で時間間隔によるセッション分割と時給計算ができる", () => {
    const parsed = parseActionLog(asLogText(actionLines));
    const sessions = buildPlaySessions(parsed.rows, 30);
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(session.startTime).toBeDefined();
      expect(session.endTime).toBeDefined();
      expect(session.durationMinutes).toBeGreaterThanOrEqual(1);
      expect(typeof session.hourlyNet).toBe("number");
    }
  });

  it("rankSoldItems で売れ筋アイテムがランキング集計される", () => {
    const parsed = parseActionLog(asLogText(actionLines));
    const ledger = buildLedger(parsed.rows);
    const rankings = rankSoldItems(ledger);
    expect(Array.isArray(rankings)).toBe(true);
    for (const r of rankings) {
      expect(r.itemName).toBeDefined();
      expect(r.totalQuantity).toBeGreaterThan(0);
      expect(r.totalGross).toBeGreaterThan(0);
    }
  });
});
