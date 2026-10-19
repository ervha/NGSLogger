-- メセタ帳の初期スキーマ（バージョン 1）
-- Web 版（SQLite Wasm）と Tauri 版（sql プラグイン）で同じ文を使う。
-- キャラクターは ID と名前そのものではなくハッシュだけを保存する。

PRAGMA foreign_keys = ON;

CREATE TABLE schema_version (
  version INTEGER NOT NULL PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE import_file (
  id INTEGER PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  source_path TEXT,
  kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  period_start TEXT,
  period_end TEXT,
  last_timestamp TEXT,
  last_sequence INTEGER,
  imported_at TEXT NOT NULL
);

CREATE TABLE character (
  id INTEGER PRIMARY KEY,
  char_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  ship TEXT
);

-- 行の一意キーは（種別, 日時, 通番, 行内容のハッシュ）。通番はセッションをまたぐと重複しうる。
CREATE TABLE raw_event (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  action TEXT,
  item_name TEXT,
  quantity INTEGER,
  extras_json TEXT NOT NULL,
  char_hash TEXT,
  unique_key TEXT NOT NULL UNIQUE
);

CREATE TABLE session (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  char_hash TEXT,
  summary_json TEXT
);

CREATE TABLE purchase (
  id INTEGER PRIMARY KEY,
  purchased_at TEXT NOT NULL,
  source TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER,
  event_key TEXT NOT NULL UNIQUE
);

CREATE TABLE shop_take (
  id INTEGER PRIMARY KEY,
  taken_at TEXT NOT NULL,
  amount INTEGER NOT NULL,
  estimate_json TEXT,
  event_key TEXT NOT NULL UNIQUE
);

CREATE TABLE listing (
  id INTEGER PRIMARY KEY,
  listed_at TEXT NOT NULL,
  item_name TEXT NOT NULL,
  price INTEGER,
  status TEXT NOT NULL,
  shop_take_id INTEGER,
  event_key TEXT NOT NULL UNIQUE,
  FOREIGN KEY (shop_take_id) REFERENCES shop_take (id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO schema_version (version, applied_at) VALUES (1, '1970-01-01T00:00:00Z');

INSERT INTO settings (key, value) VALUES
  ('fee_rate', '0.10'),
  ('day_boundary_hour', '0'),
  ('read_chat', 'false');
