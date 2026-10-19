/**
 * ログファイルのバイト列を文字列にする。
 *
 * PC版 NGS のログは UTF-16LE（先頭 BOM は FF FE）、改行は CRLF、区切りはタブ。
 * Dart の `Utf8Decoder` / `utf.decode` に当たる処理で、ブラウザにも Node にもある
 * `TextDecoder` だけを使う。React やファイルシステムには触れない。
 */

export type LogEncoding = "utf-16le" | "utf-16be" | "utf-8";

export interface DecodeResult {
  text: string;
  encoding: LogEncoding;
  /** 先頭に BOM があったか */
  hadBom: boolean;
}

export interface SplitLines {
  /** 改行まで揃った行。改行文字自体は含まない */
  lines: string[];
  /** 末尾が改行で終わっていなかった残り。取り込みには使わない */
  partial: string;
}

type Bytes = Uint8Array<ArrayBufferLike>;

function concat(left: Bytes, right: Bytes): Bytes {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

function codeUnit(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  const first = bytes[offset] ?? 0;
  const second = bytes[offset + 1] ?? 0;
  return littleEndian ? first | (second << 8) : (first << 8) | second;
}

/** 末尾が上位サロゲート（絵文字などの前半）なら、次のチャンクと組になるまで残す。 */
function endsWithHighSurrogate(bytes: Uint8Array, littleEndian: boolean): boolean {
  if (bytes.length < 2) return false;
  const unit = codeUnit(bytes, bytes.length - 2, littleEndian);
  return unit >= 0xd800 && unit <= 0xdbff;
}

/**
 * ファイルを少しずつ渡しても、文字の途中や UTF-16 の 2 バイト境界で切れないようにする。
 * 大きなログを分割して読むときに使う。
 */
export class LogChunkDecoder {
  private pending: Bytes = new Uint8Array(0);
  // TypeScript 7.0 では lib のクラス名を型の位置に書けないことがある。
  private decoder: InstanceType<typeof TextDecoder> | undefined;
  encoding: LogEncoding | undefined;
  hadBom = false;

  push(chunk: Bytes): string {
    if (chunk.length > 0) this.pending = concat(this.pending, chunk);
    this.ensureEncoding(false);
    return this.pull(false);
  }

  finish(): string {
    this.ensureEncoding(true);
    return this.pull(true);
  }

  private ensureEncoding(final: boolean): void {
    if (this.encoding) return;
    if (this.pending.length < 2 && !final) return;

    const bytes = this.pending;
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      this.use("utf-16le", true, bytes.subarray(2));
      return;
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      this.use("utf-16be", true, bytes.subarray(2));
      return;
    }
    // BOM が無い UTF-16LE。ASCII の時刻が並ぶログでは 2 バイト目が 0 になる。
    if (bytes.length >= 2 && bytes[1] === 0x00) {
      this.use("utf-16le", false, bytes);
      return;
    }
    if (final || bytes.length >= 2) {
      this.use("utf-8", false, bytes);
    }
  }

  private use(encoding: LogEncoding, hadBom: boolean, rest: Bytes): void {
    this.encoding = encoding;
    this.hadBom = hadBom;
    this.pending = rest;
    this.decoder = new TextDecoder(encoding);
  }

  private pull(final: boolean): string {
    if (!this.decoder || !this.encoding) return "";

    let end = this.pending.length;
    if (!final && this.encoding !== "utf-8") {
      if (end % 2 !== 0) end -= 1;
      const slice = this.pending.subarray(0, end);
      if (endsWithHighSurrogate(slice, this.encoding === "utf-16le")) end -= 2;
    }
    if (end <= 0) return "";

    const slice = this.pending.subarray(0, end);
    this.pending = this.pending.subarray(end);
    // stream: true の間は、デコーダが未完成の文字を自分で保持する。
    return this.decoder.decode(slice, { stream: !final });
  }
}

/** バイト列全体をデコードする。チャンク処理は {@link LogChunkDecoder}。 */
export function decodeLogBytes(bytes: Bytes): DecodeResult {
  const decoder = new LogChunkDecoder();
  const text = decoder.push(bytes) + decoder.finish();
  return {
    text,
    encoding: decoder.encoding ?? "utf-8",
    hadBom: decoder.hadBom,
  };
}

/**
 * 改行で行に分ける。CRLF も LF も受ける。
 * 末尾が改行で終わっていない部分は `partial` に残す（書き込み中の最終行は次回に回す）。
 */
export function splitLogLines(text: string): SplitLines {
  // チャンクの末尾が CR だけのとき、次が LF かもしれないので行を確定しない。
  let heldCr = false;
  let body = text;
  if (body.endsWith("\r")) {
    body = body.slice(0, -1);
    heldCr = true;
  }
  const normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.length === 0) {
    return { lines: [], partial: heldCr ? "\r" : "" };
  }

  const endsWithNewline = normalized.endsWith("\n");
  const parts = normalized.split("\n");
  if (endsWithNewline) {
    parts.pop();
    return { lines: parts, partial: heldCr ? "\r" : "" };
  }
  const partial = parts.pop() ?? "";
  return { lines: parts, partial: heldCr ? `${partial}\r` : partial };
}

/**
 * チャンクのバイト列から、改行まで揃った行だけを返す。
 * `finish` の `held` は改行がまだ来ていない末尾で、取り込みには使わない。
 */
export class LogLineReader {
  private readonly bytes = new LogChunkDecoder();
  private pendingText = "";

  push(chunk: Bytes): string[] {
    this.pendingText += this.bytes.push(chunk);
    const split = splitLogLines(this.pendingText);
    this.pendingText = split.partial;
    return split.lines;
  }

  finish(): { lines: string[]; held: string } {
    this.pendingText += this.bytes.finish();
    const split = splitLogLines(this.pendingText);
    this.pendingText = "";
    return { lines: split.lines, held: split.partial };
  }
}
