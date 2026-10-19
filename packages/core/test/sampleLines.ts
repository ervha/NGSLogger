/**
 * テスト用の合成ログ。実ログの列の形に合わせてあるが、キャラクターは「テストキャラ」だけ。
 * 他プレイヤーの名前や ID は入れない。チャット本文のファイルも作らない。
 */

export const actionLines = [
  "2026-10-11T20:34:12\t10\t[TakeFromShop]\t00000000\tテストキャラ\t\tN-Meseta(10260000)\tCurrentN-Meseta(20260000)",
  "2026-10-11T20:40:12\t20\t[Warehouse-N-Meseta]\t00000000\tテストキャラ\t\tN-Meseta(-1000000)\tCurrentN-Meseta(1000000)\tWarehouseN-Meseta(5000000)",
  "2026-10-11T20:40:17\t21\t[Buy]\t00000000\tテストキャラ\tサンプルインテグラ\tNum(1)",
  "2026-10-11T20:40:17\t22\t[Buy]\t00000000\tテストキャラ\t\tN-Meseta(0)\tCurrentN-Meseta(950000)",
  "2026-10-11T20:40:27\t23\t[Buy]\t00000000\tテストキャラ\tサンプルキューブ\tNum(1)",
  "2026-10-11T20:40:27\t24\t[Buy]\t00000000\tテストキャラ\t\tN-Meseta(0)\tCurrentN-Meseta(900000)",
  "2026-10-11T20:41:00\t25\t[Buy]\t00000000\tテストキャラ\tサンプル交換素材\tNum(800)",
  "2026-10-11T23:59:54\t100\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルアミュレット",
  "2026-10-11T23:59:54\t101\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルアミュレット",
  "2026-10-11T23:59:54\t102\t[DisplayToShop-SetValue]\tサンプルアミュレット\tN-Meseta(800000)",
  "2026-10-11T23:59:54\t103\t[DisplayToShop-SetValue]\tサンプルアミュレット\tN-Meseta(900000)",
  "2026-10-12T00:01:25\t110\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルダガー+100\tattr:NONE(0)",
  "2026-10-12T00:01:25\t111\t[DisplayToShop-SetValue]\tサンプルダガー\tattr:NONE(0)\tN-Meseta(1000000)",
  "2026-10-12T00:01:37\t112\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルスピア+100\tattr:NONE(0)",
  "2026-10-12T00:01:37\t113\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルボウ+100\tattr:NONE(0)",
  "2026-10-12T00:01:37\t114\t[DisplayToShop-SetValue]\tサンプルボウ\tattr:NONE(0)\tN-Meseta(900000)",
  "2026-10-12T00:01:37\t115\t[DisplayToShop-SetValue]\tサンプルスピア\tattr:NONE(0)\tN-Meseta(900000)",
  "2026-10-12T00:02:00\t120\t[Pickup]\t00000000\tテストキャラ\tサンプル鉱石\tNum(3)",
  "2026-10-12T00:02:01\t121\t[Pickup]\t00000000\tテストキャラ\t\tN-Meseta(1500)\tCurrentN-Meseta(901500)",
  "2026-10-12T00:02:02\t122\t[DiscradExchange]\t00000000\tテストキャラ\t\tN-Meseta(209245)\tCurrentN-Meseta(1110745)",
  "2026-10-12T20:38:13\t200\t[TakeFromShop]\t00000000\tテストキャラ\t\tN-Meseta(1710000)\tCurrentN-Meseta(2820745)",
  "2026-10-12T20:57:34\t210\t[Buy-FromUserShop]\t00000000\tテストキャラ\tサンプルロッド\tattr:NONE(0)",
  "2026-10-12T20:57:34\t211\t[Buy-FromUserShop]\t00000000\tテストキャラ\t\tN-Meseta(-1000000)\tCurrentN-Meseta(1820745)",
  "2026-10-12T20:58:15\t220\t[WithdrawFromShop]\t00000000\tテストキャラ\tサンプルスピア+100",
  "2026-10-12T23:28:00\t300\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルアミュレット",
  "2026-10-12T23:28:00\t301\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルアミュレット",
  "2026-10-12T23:28:00\t302\t[DisplayToShop-SetValue]\tサンプルアミュレット\tN-Meseta(700000)",
  "2026-10-12T23:28:00\t303\t[DisplayToShop-SetValue]\tサンプルアミュレット\tN-Meseta(700000)",
  "2026-10-13T20:49:03\t400\t[TakeFromShop]\t00000000\tテストキャラ\t\tN-Meseta(630000)\tCurrentN-Meseta(2450745)",
  "2026-10-13T23:02:04\t410\t[DisplayToShop]\t00000000\tテストキャラ\tサンプルアミュレット",
  "2026-10-13T23:02:04\t411\t[DisplayToShop-SetValue]\tサンプルアミュレット\tN-Meseta(600000)",
  "2026-10-13T23:02:10\t412\t[WithdrawFromShop]\t00000000\tテストキャラ\tサンプルアミュレット",
];

export const rewardLines = [
  '2026-10-11T20:31:33\t1\t"6\tテストキャラ\tBackpack\tサンプル報酬\tNum(1)"',
  '2026-10-11T20:31:40\t2\t"32\tテストキャラ\tN-Meseta\t\tNum(1000)"',
];

export const scratchLines = [
  "2026-10-11T20:32:23\t3\tサンプルスクラッチ\tPay\t00000000\tテストキャラ\tGACHAFREE\t0/2200",
  "2026-10-11T20:32:24\t4\tサンプルスクラッチ\tReceived\t00000000\tテストキャラ\tサンプル景品\tNum(1)",
];

export const currencyLines = [
  '2026-10-11T20:31:33\t5\t"BuyItem\t00000000\tテストキャラ\tサンプル更新\t1\t-10\t6605\t6595"',
];

/** チャット系は fixtures/ に置かない。判定テストの中だけで、短い合成行を使う。 */
export const chatLine =
  "2026-10-11T20:32:35\t1\tPUBLIC\t00000001\t発言者A\tこんにちは";

export const symbolChatLine =
  "2026-10-11T20:47:28\t1\tPUBLIC\t00000001\t発言者A\tabcdef0123456789";

export function asLogText(lines: readonly string[]): string {
  return `${lines.join("\r\n")}\r\n`;
}

/** テストの中でだけ使う。BMP（日本語）まで。絵文字の検証はバイトを直接書く。 */
export function encodeUtf16Le(text: string, withBom = true): Uint8Array {
  const bytes = new Uint8Array(text.length * 2 + (withBom ? 2 : 0));
  let offset = withBom ? 2 : 0;
  if (withBom) {
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
  }
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes[offset] = code & 0xff;
    bytes[offset + 1] = code >> 8;
    offset += 2;
  }
  return bytes;
}
