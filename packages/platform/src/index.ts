/**
 * Web 版と Tauri 版で実装を差し替える境界。
 *
 * ここにはインターフェースだけを置く。ファイルの読み方や DB の実行は
 * apps/web 側（ブラウザ用・Tauri 用）がこの形に合わせて実装する。
 * Dart の abstract class に近いが、実装は別パッケージに分ける。
 */

export type SqlValue = string | number | null;

/** `SELECT` の 1 行。列名がキー。 */
export type SqlRow = Record<string, SqlValue>;

/**
 * SQLite を実行する窓口。Web 版は SQLite Wasm、Tauri 版は sql プラグイン。
 * 同じ SQL 文を両方に渡す。
 */
export interface SqlExecutor {
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
  select<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** ユーザーが選んだ、または自動検出された、まだ中身を読んでいないログファイル。 */
export interface LogFileRef {
  /** 表示名。 */
  name: string;
  /** ファイルのフルパス（Tauri 版でのみ使用） */
  path?: string;
}

export interface LogSource {
  /** ファイル、またはフォルダの中のファイルを初期検出・選択する。選ばなければ空配列。 */
  pick(mode: "files" | "directory"): Promise<LogFileRef[]>;
  /** 保存されたフォルダ等から自動でファイル一覧を走査・検出する。 */
  scan?(directoryPath?: string): Promise<LogFileRef[]>;
  /** バイト列を読む。呼び出し側はこれをサーバーへ送らない。 */
  read(file: LogFileRef): Promise<Uint8Array>;
}

/** 追記を見張る。ゲームのプロセスには触らない。zip 版の次期機能。 */
export interface Watcher {
  /** 監視を止める関数を返す。 */
  watch(path: string, onChange: () => void): Promise<() => void>;
}

/**
 * 通知。ポータブル版の Windows では OS 通知を使わない方針（インストールされたアプリでしか動かないため）。
 * アプリ内の表示向け。
 */
export interface Notifier {
  notify(title: string, body: string): Promise<void>;
}

export interface AppSettings {
  /** マイショップ手数料。初期値は 0.10 */
  feeRate: number;
  /** 日別集計の日付境界。初期値は 0 時 */
  dayBoundaryHour: number;
  /** zip / ポータブル版の保存済みログフォルダ。Web 版では undefined */
  logFolder?: string;
  /** チャットログの読み取り（初期値: false） */
  readChat: boolean;
}

export interface SettingsStore {
  load(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  feeRate: 0.1,
  dayBoundaryHour: 0,
  readChat: false,
};
