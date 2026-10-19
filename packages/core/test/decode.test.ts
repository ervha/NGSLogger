import { describe, expect, it } from "vitest";
import { LogChunkDecoder, LogLineReader, decodeLogBytes, splitLogLines } from "../src/decode.ts";
import { asLogText, encodeUtf16Le } from "./sampleLines.ts";

describe("decodeLogBytes", () => {
  it("UTF-16LE の BOM を外して日本語を読む", () => {
    const text = asLogText(["2026-10-11T20:00:00\t1\t[Pickup]\t00000000\tテストキャラ\t鉱石"]);
    const decoded = decodeLogBytes(encodeUtf16Le(text));
    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.hadBom).toBe(true);
    expect(decoded.text).toBe(text);
  });

  it("BOM が無くても、2バイト目が 0 なら UTF-16LE として読む", () => {
    const text = "2026-10-11T20:00:00\t1\t[Pickup]\r\n";
    const decoded = decodeLogBytes(encodeUtf16Le(text, false));
    expect(decoded.encoding).toBe("utf-16le");
    expect(decoded.hadBom).toBe(false);
    expect(decoded.text).toBe(text);
  });

  it("UTF-8 はフォールバックで読む", () => {
    const text = "not-a-log";
    const decoded = decodeLogBytes(new TextEncoder().encode(text));
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.hadBom).toBe(false);
    expect(decoded.text).toBe(text);
  });

  it("空のファイルは空文字", () => {
    const decoded = decodeLogBytes(new Uint8Array());
    expect(decoded.text).toBe("");
    expect(decoded.encoding).toBe("utf-8");
  });
});

describe("LogChunkDecoder", () => {
  it("UTF-16 の文字の途中でチャンクが割れてもつながる", () => {
    const text = "Aあ\r\nB";
    const bytes = encodeUtf16Le(text);
    // BOM(2) + 'A'(2) の途中、つまり 3 バイトで切る。
    const decoder = new LogChunkDecoder();
    const head = decoder.push(bytes.subarray(0, 3));
    const tail = decoder.push(bytes.subarray(3));
    expect(head + tail + decoder.finish()).toBe(text);
  });

  it("サロゲートペアの途中ではデコードを保留する", () => {
    // 😀 は U+1F600 → UTF-16LE では D8 3D / DE 00 ではなく 3D D8 00 DE
    const bytes = new Uint8Array([0x3d, 0xd8, 0x00, 0xde]);
    const decoder = new LogChunkDecoder();
    // 2 バイト目が 0 ではないので、先に UTF-16 と分からせる BOM を付ける。
    const withBom = new Uint8Array([0xff, 0xfe, ...bytes]);
    expect(decoder.push(withBom.subarray(0, 4))).toBe("");
    expect(decoder.push(withBom.subarray(4)) + decoder.finish()).toBe("😀");
  });
});

describe("LogLineReader", () => {
  it("CRLF がチャンク境界で分かれても 1 行にする", () => {
    const line = "2026-10-11T20:00:00\t1\t[Pickup]\t00000000\tテストキャラ\t石\tNum(1)";
    const bytes = encodeUtf16Le(`${line}\r\n`);
    // 末尾の LF（0A 00）の直前で切る。CR までが先のチャンク。
    const reader = new LogLineReader();
    const first = reader.push(bytes.subarray(0, bytes.length - 2));
    const second = reader.push(bytes.subarray(bytes.length - 2));
    const done = reader.finish();
    expect(first).toEqual([]);
    expect(second).toEqual([line]);
    expect(done.lines).toEqual([]);
    expect(done.held).toBe("");
  });

  it("改行で終わっていない末尾は held に残し、行にしない", () => {
    const bytes = encodeUtf16Le("2026-10-11T20:00:00\t1\t[Pickup]\t00000000\tテストキャラ\t石");
    const reader = new LogLineReader();
    reader.push(bytes);
    const done = reader.finish();
    expect(done.lines).toEqual([]);
    expect(done.held.startsWith("2026-10-11T20:00:00")).toBe(true);
  });
});

describe("splitLogLines", () => {
  it("CRLF を外し、末尾の改行では空行を足さない", () => {
    expect(splitLogLines("a\r\nb\r\n")).toEqual({ lines: ["a", "b"], partial: "" });
    expect(splitLogLines("a\r\nb")).toEqual({ lines: ["a"], partial: "b" });
    // 末尾の CR は、次のチャンクが LF かもしれないので行にしない。
    expect(splitLogLines("a\r")).toEqual({ lines: [], partial: "a\r" });
  });
});
