import { describe, expect, it } from "vitest";
import { detectLogBytes, detectLogText } from "../src/detect.ts";
import {
  actionLines,
  asLogText,
  chatLine,
  currencyLines,
  encodeUtf16Le,
  rewardLines,
  scratchLines,
  symbolChatLine,
} from "./sampleLines.ts";

describe("detectLogText", () => {
  it("角括弧のアクションなら ActionLog", () => {
    expect(detectLogText(asLogText(actionLines)).kind).toBe("ActionLog");
  });

  it("引用符で始まる区分番号なら RewardLog", () => {
    expect(detectLogText(asLogText(rewardLines)).kind).toBe("RewardLog");
  });

  it("Pay / Received なら ScratchLog", () => {
    expect(detectLogText(asLogText(scratchLines)).kind).toBe("ScratchLog");
  });

  it("BuyItem で始まる引用符なら通貨ログ", () => {
    const detected = detectLogText(asLogText(currencyLines));
    expect(detected.kind).toBe("CurrencyLog");
    expect(detected.skipBody).toBe(false);
  });

  it("チャンネル名だけを見て ChatLog とし、本文は結果に残さない", () => {
    const detected = detectLogText(asLogText([chatLine, chatLine]));
    expect(detected).toEqual({ kind: "ChatLog", skipBody: true });
  });

  it("本文が16進ハッシュだけのときは SymbolChatLog（推定）", () => {
    const detected = detectLogText(asLogText([symbolChatLine]));
    expect(detected).toEqual({ kind: "SymbolChatLog", skipBody: true });
  });

  it("空や未知の形は Unknown", () => {
    expect(detectLogText("").kind).toBe("Unknown");
    expect(detectLogText(asLogText(["2026-10-11T20:00:00\t1\thello"])).kind).toBe("Unknown");
  });

  it("チャットと分かった時点で、後ろの行は見ない", () => {
    const secret = "この行はチャンネル行のあとにあり、判定には使われない";
    const text = `${chatLine}\r\n${secret}`;
    const detected = detectLogText(text);
    expect(detected.kind).toBe("ChatLog");
    expect(JSON.stringify(detected).includes(secret)).toBe(false);
  });
});

describe("detectLogBytes", () => {
  it("UTF-16LE のバイト列から ActionLog と判定する", () => {
    const bytes = encodeUtf16Le(asLogText(actionLines));
    expect(detectLogBytes(bytes).kind).toBe("ActionLog");
  });

  it("チャットは先頭だけを見て skipBody を返す", () => {
    const padding = `${"あ".repeat(20_000)}\r\n`;
    const bytes = encodeUtf16Le(`${chatLine}\r\n${padding}`);
    const detected = detectLogBytes(bytes);
    expect(detected).toEqual({ kind: "ChatLog", skipBody: true });
  });
});
