/**
 * スキーマの入口。SQL 本体は migrations/0001_init.sql。
 * Web 版も Tauri 版も、この同じ文を SQLite に流す。
 */

export interface Migration {
  version: number;
  /** パッケージ内の SQL ファイル名 */
  file: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, file: "migrations/0001_init.sql" },
];

export const SCHEMA_VERSION = 1;
