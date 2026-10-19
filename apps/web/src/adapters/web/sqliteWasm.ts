/**
 * ブラウザ内の SQLite。保存先は OPFS の opfs-sahpool。
 * この方式は COOP / COEP ヘッダーが要らない（同時に開ける接続は 1 つ）。
 * 画面の縦切りではまだ呼ばない。取り込み Worker から使う前提。
 */

import type { SqlExecutor, SqlRow, SqlValue } from "@meseta/platform";
import sqlite3InitModule, { type Database, type SqlValue as WasmSqlValue } from "@sqlite.org/sqlite-wasm";

function narrow(value: WasmSqlValue): SqlValue {
  if (typeof value === "string" || typeof value === "number" || value === null) return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

function wrap(db: Database): SqlExecutor {
  const executor: SqlExecutor = {
    async execute(sql: string, params: readonly SqlValue[] = []) {
      db.exec({ sql, bind: [...params] });
    },
    async select<T extends SqlRow>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
      const rows = db.selectObjects(sql, [...params]);
      return rows.map((row) => {
        const out: SqlRow = {};
        for (const [key, value] of Object.entries(row)) out[key] = narrow(value);
        return out as T;
      });
    },
    async transaction(fn) {
      db.exec("BEGIN");
      try {
        const result = await fn(executor);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return executor;
}

/** Worker の中で呼ぶ。メインスレッドでは OPFS を使えない。 */
export async function openSahPoolExecutor(filename = "/meseta.db"): Promise<SqlExecutor> {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: "meseta-ledger",
    directory: "meseta-ledger-sahpool",
    initialCapacity: 6,
  });
  return wrap(new pool.OpfsSAHPoolDb(filename));
}
