/** フッターの公式サイト。capability の opener スコープと同じ文字列にする。 */
export const OFFICIAL_SITE_URL = "https://pso2.jp/players/";

/**
 * Tauri の webview ではこのリンクを遷移させず、OS のブラウザで開く。
 * 画面側の分岐は `import.meta.env.MODE !== "tauri"` と書く。関数呼び出しにすると
 * Vite が Tauri の import を Web 版の成果物から落とせない。
 */
export function shouldOpenOfficialSiteInOsBrowser(mode: string): boolean {
  return mode === "tauri";
}
