import { describe, expect, it } from "vitest";
import { detectLogText } from "../src/detect.ts";
import { isSymbolChat, parseChatLine, parseChatLines, parseChatLog } from "../src/parseChat.ts";

const sampleChatLines = [
  "2026-10-15T19:30:00\t1\tPUBLIC\t10000001\tアークスA\tこんにちは！よろしくおねがいします",
  "2026-10-15T19:30:15\t2\tPARTY\t10000002\tアークスB\tよろしくですー！\tクエスト行きましょう",
  "2026-10-15T19:31:00\t3\tGUILD\t10000001\tアークスA\tチーム緊急参加できる人いますか？",
  "2026-10-15T19:35:00\t4\tPUBLIC\t10000003\tアークスC\t0123456789abcdef0123456789abcdef",
];

describe("parseChat", () => {
  it("ChatLog の 1 行を正しくパースする", () => {
    const row = parseChatLine(sampleChatLines[0] ?? "");
    expect(row).toEqual({
      timestamp: "2026-10-15T19:30:00",
      sequence: 1,
      channel: "PUBLIC",
      characterId: "10000001",
      characterName: "アークスA",
      body: "こんにちは！よろしくおねがいします",
    });
    expect(isSymbolChat(row!)).toBe(false);
  });

  it("タブを含む本文も保持してパースする", () => {
    const row = parseChatLine(sampleChatLines[1] ?? "");
    expect(row?.body).toBe("よろしくですー！\tクエスト行きましょう");
    expect(row?.channel).toBe("PARTY");
  });

  it("シンボルチャットを判定できる", () => {
    const row = parseChatLine(sampleChatLines[3] ?? "");
    expect(row).toBeDefined();
    expect(isSymbolChat(row!)).toBe(true);
  });

  it("複数行を一括パースできる", () => {
    const rows = parseChatLines(sampleChatLines);
    expect(rows).toHaveLength(4);
    expect(rows[2]?.channel).toBe("GUILD");
  });

  it("parseChatLog で全体のパースと末尾部分判定が行える", () => {
    const text = sampleChatLines.join("\r\n") + "\r\n";
    const res = parseChatLog(text);
    expect(res.heldPartial).toBe(false);
    expect(res.rows).toHaveLength(4);
  });

  it("detectLogText で readChat オプションが機能する", () => {
    const text = sampleChatLines.join("\r\n");
    // readChat: false (既定)
    const offRes = detectLogText(text);
    expect(offRes.kind).toBe("ChatLog");
    expect(offRes.skipBody).toBe(true);

    // readChat: true
    const onRes = detectLogText(text, { readChat: true });
    expect(onRes.kind).toBe("ChatLog");
    expect(onRes.skipBody).toBe(false);
  });
});
