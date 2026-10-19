/**
 * sampleLines.ts から fixtures/ を書き出す。
 * 使い方: node packages/core/test/writeFixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionLines,
  asLogText,
  currencyLines,
  encodeUtf16Le,
  rewardLines,
  scratchLines,
} from "./sampleLines.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const srcDir = resolve(root, "fixtures/src");
const logDir = resolve(root, "fixtures/logs");
mkdirSync(srcDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const files = [
  ["action-sample.txt", actionLines],
  ["reward-sample.txt", rewardLines],
  ["scratch-sample.txt", scratchLines],
  ["currency-sample.txt", currencyLines],
] as const;

for (const [name, lines] of files) {
  const text = asLogText(lines);
  writeFileSync(resolve(srcDir, name), text.replace(/\r\n/g, "\n"), "utf8");
  writeFileSync(resolve(logDir, name), encodeUtf16Le(text));
}

console.log(`wrote ${files.length} fixtures`);
