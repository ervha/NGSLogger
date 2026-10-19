# メセタ帳（Meseta Ledger）

PSO2 NGS（PC版）が書き出す公式ログを読み、プレイの収支とマイショップの台帳をまとめるためのツールです。いまの中身は、その最初のひな形と、ActionLog の行数を数える縦切りです。

本ツールは非公式のファンメイドツールです。株式会社セガとは関係ありません。

PHANTASY STAR ONLINE 2 NEW GENESIS  
（C）SEGA

公式サイト: https://pso2.jp/players/

利用規約: https://pso2.jp/players/support/rules/  
ログファイルの案内: https://pso2.jp/players/support/faq/536/  
著作物利用ガイドライン: https://pso2.jp/players/support/rules/copyright/

## やらないこと

ゲームのクライアント、通信、サーバーには触れません。

- パケットキャプチャ、プロキシ、通信の解読はしません。
- メモリの読み取り、DLL の注入、クライアントファイルの展開や解析はしません。
- マクロ、キー送信、画面認識によるクリックなどの自動操作はしません。
- クライアントから抜き出したデータや、攻略サイトの転載は使いません。
- RMT へのリンクや、N-メセタの円換算は出しません。
- 他のプレイヤーの名前、ID、会話は保存も表示もしません。チャット系のログは読みません。

ログは、Web版ではブラウザの中だけで処理します。このひな形に、ログを受け取るサーバーはありません。

ライセンスは未定です。このリポジトリに LICENSE ファイルは置いていません。

## いま動くこと

- UTF-16LE（BOM あり・なし）のデコードと、チャンクの境界で文字や行が割れない処理
- 中身による種別判定（ActionLog / RewardLog / ScratchLog / 通貨系 / ChatLog / SymbolChatLog / 未対応）
- ActionLog のパース（SetValue 行の列ずれ、金額行、`[DiscradExchange]` の綴り）
- 合成ログでのマイショップ購入、NPC 購入の差分、売却推定のテスト
- ブラウザでファイルまたはフォルダを選び、ActionLog の行数を表示する画面

まだ無いもの: データベースへの保存、セッション集計、グラフの本番画面、Windows 用 exe のビルド確認。

## 必要なもの

開発用の PC は Windows（PowerShell）を想定しています。確認に使った版は下の表です。

| ツール | このひな形で確認した版 | 入れ方 |
|---|---|---|
| Git | 入っていればよい | `winget install --id Git.Git -e` |
| Node.js | 24 LTS（24.22.0） | https://nodejs.org/ の LTS |
| pnpm | 12.14.0 | `corepack enable` のあと `corepack prepare pnpm@12.14.0 --activate` |
| Rust（zip版を作るとき） | stable（MSVC） | `winget install --id Rustlang.Rustup` のあと `rustup default stable-msvc` |
| Visual Studio Build Tools | Tauri の前提 | 「Desktop development with C++」 |
| WebView2 | Windows 10（1803 以降）と 11 には入っている | 無いときだけ Evergreen Bootstrapper |

Tauri の前提は公式の説明に沿います: https://v2.tauri.app/start/prerequisites/

エディタは VS Code に ESLint、rust-analyzer、Tauri の拡張を入れると読みやすいです。Firebase CLI は、公開の設定をする段階で `npm install -g firebase-tools` します。プロジェクト ID はまだ入れていません。

## セットアップ（Windows / PowerShell）

```powershell
git clone https://github.com/ervha/NGSLogger.git
cd NGSLogger
node -v    # v24 であることを確認
corepack enable
corepack prepare pnpm@12.14.0 --activate
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev
```

ブラウザで http://localhost:5173 を開きます。ログフォルダの目安は `ドキュメント\SEGA\PHANTASYSTARONLINE2\log` です。

デスクトップ版のウィンドウで同じ画面を開く（Rust と Build Tools を入れたあと）:

```powershell
pnpm --filter desktop dev
```

インストーラーを作らず、exe だけ出す:

```powershell
pnpm --filter desktop build
```

中身は `tauri build --no-bundle` です。exe は `apps\desktop\src-tauri\target\release\` に出ます。この Linux 上の作業では Windows 向け exe は作っていません。

## ディレクトリ

```
packages/core       ログのデコード・判定・パース・売却推定（画面に依存しない）
packages/db         SQLite のスキーマ（SQL）
packages/platform   Web 版と Tauri 版で差し替えるインターフェース
apps/web            Vite + React の画面
apps/desktop        Tauri 2。画面は apps/web のビルド結果を包む
fixtures            合成ログ。実ログやチャットは入れない
docs                このツールについて、プライバシー
```

Dart を書いている人向けの対応は、計画書の「Dart → TypeScript」の表がそのまま使えます。`Future` は `Promise`、`String?` は `string | undefined`、Widget と setState は関数コンポーネントと `useState` です。

## 計画書（2026-10-19）との違い

バージョンは初期化の日に入った最新の安定版です。計画書の表と違うところだけ書きます。

- Node.js は 24.22.0（24 LTS）。計画の「開始時は 24 LTS」に沿っています。CI も `.nvmrc` の 24 です。
- pnpm 12.14.0、Vite 8.3.4、React 19.3.1、Vitest 5.0.5、ECharts 6.1.0、`@sqlite.org/sqlite-wasm` 3.54.1-build1 は、計画書に書いてあった版と一致しました。
- 型チェックの `tsc` は TypeScript 7.0.2（create-vite 9.3.0 の既定）です。TypeScript 7.0 には、ESLint が必要とするコンパイラ API がまだありません。公式の案内どおり、`typescript` という名前では TypeScript 6.0.2（`@typescript/typescript6`）を入れ、`tsc` 本体は `@typescript/native`（中身は TypeScript 7.0.2）にしています。
- create-vite の React テンプレートは既定が Oxlint でした。計画が ESLint を挙げているので、`--eslint` で生成しています。
- pnpm 12 は、公開直後のパッケージを一度保留します。`@sqlite.org/sqlite-wasm@3.54.1-build1` だけ `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` に入れています。
- Tauri CLI は 2.12.3、`@tauri-apps/api` は 2.12.4、plugin-fs 2.7.1、plugin-sql 2.6.0、plugin-dialog 2.8.3 です。計画書は「Tauri 2」とだけ書いていました。プラグインの crate は Rust 1.90 以上（edition 2024）を要求します。`rustup default stable-msvc` で入る stable を使ってください。この作業環境の rustc 1.83 ではマニフェストを読めなかったため、`cargo check` と Windows 向け exe のビルドはしていません。
- アプリの識別子 `dev.meseta.ledger` は仮です。公開前に自分のドメインへ変えてください。
- ゴールデンテストは、解析レポートと同じ形の合成データです。実ログの件数（拾得 6043 行など）は再現していません。実在のプレイヤー名や ID は入れていません。ChatLog のファイルも置いていません。
- 売却推定は試作の総当たりを移植し、出品中が 12 件を超えると「推定しない」で止めます。動的計画法への置き換えはまだです。
- 画面は ActionLog の行数までです。SQLite のスキーマと opfs-sahpool の接続口はありますが、画面はまだ DB に書きません。
- ダイアログで選んだフォルダは、プラグインの説明ではその起動中だけ読み取りスコープに足されます。再起動後に残す処理は未実装です。
- Firebase のプロジェクト ID は仮の `meseta-ledger-unset` です。GitHub Actions のデプロイは、シークレット `FIREBASE_SERVICE_ACCOUNT` が空ならスキップして成功します。Windows のリリース用ワークフローも、変数 `ENABLE_DESKTOP_RELEASE` が `true` になるまでスキップします。

## テスト用ログを作り直す

`fixtures/logs/` は UTF-16LE です。行の定義は `packages/core/test/sampleLines.ts` にあります。

```powershell
node packages/core/test/writeFixtures.ts
```
