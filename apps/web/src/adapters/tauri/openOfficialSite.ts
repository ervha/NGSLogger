/**
 * 公式サイトを OS の既定ブラウザで開く。
 * ビルドモードが tauri のときだけ読み込む。Web 版の成果物には入らない。
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { OFFICIAL_SITE_URL } from "../../officialSite.ts";

export function openOfficialSite(): Promise<void> {
  return openUrl(OFFICIAL_SITE_URL);
}
