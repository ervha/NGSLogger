import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, SCHEMA_VERSION } from "../src/index.ts";

const sqlPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/migrations/0001_init.sql",
);

describe("初期スキーマ", () => {
  const sql = readFileSync(sqlPath, "utf8");

  it("バージョン 1 のファイルを指している", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toEqual([{ version: 1, file: "migrations/0001_init.sql" }]);
  });

  it("計画のテーブルと、行の一意キーがある", () => {
    for (const table of [
      "import_file",
      "raw_event",
      "session",
      "purchase",
      "listing",
      "shop_take",
      "character",
      "settings",
      "schema_version",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain("unique_key TEXT NOT NULL UNIQUE");
    expect(sql).toContain("content_hash TEXT NOT NULL UNIQUE");
    expect(sql).toContain("'read_chat', 'false'");
  });
});
