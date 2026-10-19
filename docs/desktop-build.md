# デスクトップ版のビルド

Windows 向けポータブル版は、Tauri 2 が Web 版（`apps/web`）を包んだものです。インストーラは作りません。`tauri build --no-bundle` の exe を、リリース用ワークフローが zip にします。この文書は、その exe をソースから作る手順です。

画面の入口はこれまでどおり `apps/web/dist` です。開発時は `http://localhost:5173`（`vite --mode tauri`）です。

## 足りていなかったこと

`apps/desktop/src-tauri` のひな形はあり、`frontendDist` は `../../web/dist` を指していました。ただし Rust の MSRV は 1.90 で、以前の環境は rustc 1.83 だったため、`cargo check` も exe も一度も通っていませんでした。

あわせて、次を直しています。

- Content-Security-Policy が `null`（無効）だった
- ファイル読み取りのスコープに `**`（ディスク全体）が入っていた
- 画面がまだ使っていない SQL の実行、書き込み、監視が許可されていた

ログは UTF-16LE の生バイトです。画面は `readFile` でバイト列を受け取り、デコードは `packages/core` が行います。テキストとして読む権限は付けていません。

## コマンド

リポジトリのルートで実行します。Node.js は `.nvmrc` の 24、pnpm は `packageManager` の 12.14.0、Rust は `apps/desktop/src-tauri/rust-toolchain.toml` の stable です（1.90 以上）。

```powershell
pnpm install --frozen-lockfile
pnpm dev:desktop
pnpm build:desktop
```

`pnpm build:desktop` は `pnpm --filter desktop build` と同じで、中身は `tauri build --no-bundle` です。先に `pnpm --filter web build:tauri` が走り、その成果物を埋め込みます。

リリース用ワークフローもこのコマンドを使います。Windows 上の成果物は次の exe です。名前を変えないでください。

```text
apps/desktop/src-tauri/target/release/meseta-ledger.exe
```

## Windows（配布に使う手順）

クロスコンパイルではなく、Windows 上でビルドします。

1. [Node.js 24](https://nodejs.org/) を入れる。リポジトリ直下で Corepack が pnpm 12.14.0 を使います。
2. [rustup](https://rustup.rs/) で Rust を入れる。`apps/desktop/src-tauri` に入ると `rust-toolchain.toml` が stable を選びます。1.83 ではプラグインがコンパイルできません。
3. Visual Studio Build Tools 2022 で「C++ によるデスクトップ開発」（MSVC と Windows SDK）を入れる。
4. WebView2 ランタイムを入れる。Windows 11 には入っていることが多いです。無い場合は [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/) です。
5. リポジトリ直下で `pnpm install --frozen-lockfile` のあと `pnpm build:desktop`。
6. できた `meseta-ledger.exe` を単体で起動する。インストーラはありません。exe のあるフォルダが書き込めるとき、その隣に `data\webview`（WebView2 のキャッシュ）ができます。

開発中に画面を開くときは `pnpm dev:desktop` です。Vite が `http://localhost:5173` で待ち、Tauri がその URL を開きます。

## Linux で確認したこと

この環境（Ubuntu、rustc 1.99.1）で次を確認しました。

- `pnpm build:desktop` が成功し、`apps/desktop/src-tauri/target/release/meseta-ledger`（ELF、約 17MB）ができた
- Xvfb 上でそのバイナリを起動し、12 秒間プロセスが落ちなかった。標準エラーは空で、exe の隣に `data/webview` ができた
- `pnpm dev:desktop` は Vite（http://localhost:5173）を起動し、デバッグビルドが `Running` になるところまで確認した。画面のクリックはしていない
- `cargo test --locked`（ログフォルダ記録の単体テスト 3 件）が成功した
- `pnpm lint`、`pnpm typecheck`、`pnpm test`（45 件）が成功した
- `pnpm --filter web build` のあと `pnpm --filter web check:bundle` で、Web 版の成果物に `@tauri-apps` が入っていないことを確認した

Linux でビルドするときに入れたパッケージは次です。

```text
libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf pkg-config libgtk-3-dev
```

## Windows クロスビルド

Linux から `x86_64-pc-windows-msvc` へのクロスビルドも通りました。できたファイルは PE32+ の GUI exe（約 14MB）です。

```text
apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/meseta-ledger.exe
```

この環境では実行していません。リンク時に CRT の PDB が見つからないという LNK4099 と、リソース埋め込み前の `clang-cl` によるコンパイラ判定の失敗が警告として出ました。ビルド自体は完了しています。アイコンやバージョン情報が exe に入っているかは、Windows 実機で見てください。

手順（Linux、clang 18、lld、llvm-rc があること）:

```bash
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin --locked
cd apps/desktop
pnpm exec tauri build --no-bundle --runner cargo-xwin --target x86_64-pc-windows-msvc
```

ここでは cargo-xwin 0.23.1 を使いました。`pnpm build:desktop -- --runner ...` は、引数の `--` が cargo 側に渡って失敗します。クロスビルドはこの `pnpm exec` の形にしてください。配布物を作るときは、上の「Windows」のネイティブビルドを使います。出力先がリリース用ワークフローの探索パス（`target/release/*.exe`）と違うためです。

## 権限

`apps/desktop/src-tauri/capabilities/default.json` で、画面に出しているのは次だけです。

- ウィンドウの基本操作（`core:default`）
- ファイル／フォルダを選ぶダイアログ（`dialog:allow-open`）
- exe の場所を返すコマンドと、選んだログフォルダの記録、公式ログフォルダの実パス
- `ドキュメント\SEGA\PHANTASYSTARONLINE2\log` の読み取り（`readFile` / `readDir` / `exists`）

`$DOCUMENT` は Tauri の `documentDir` です。Windows では `%USERPROFILE%\Documents` ではなく、`FOLDERID_Documents`（`SHGetKnownFolderPath`）の実パスです。OneDrive に移したドキュメント（`OneDrive\Documents` や、表示名が「ドキュメント」のフォルダ）もここに含まれます。起動時にそのパスへ `SEGA\PHANTASYSTARONLINE2\log` を足して fs スコープへ入れ、フォルダがあればそこを読みます。ダイアログで別のフォルダを選んだあとは、記録したそのフォルダを優先します。

ダイアログで選んだフォルダは、その場で fs プラグインのスコープに足されます。次回も読むため、Rust がそのパスを `data\log-folder.txt`（exe の隣に書けないときは LocalAppData）へ記録し、起動時に同じフォルダだけを許可し直します。`canonicalize` やダイアログが返す `\\?\` 付き（`\\?\C:\...` や `\\?\UNC\サーバ\共有`）は、記録する前に dunce と同じ規則で通常のパスへ戻します。保存、次回のスコープ、画面へ返すパスは同じ表記です。260 文字を超えるパスや、`CON` などの予約名はそのまま残します。画面から任意のパスを許可リストへ足すコマンドはありません。記録ファイル自体は fs プラグインから読めないようにしています。

SQL プラグインはバイナリにリンクしたままです。DB のパスを `data` に限れるようになるまで、画面からの `load` / `execute` は許可していません。追記監視のクレート機能は残していますが、今の画面は数秒ごとの再スキャンなので、watch 権限は出していません。`data` への書き込みも、画面の fs API では許可していません。WebView2 のキャッシュとログフォルダの記録は Rust が書きます。

CSP は本番では自分自身と Tauri の IPC（`ipc:` と `http://ipc.localhost`）だけです。外部への `connect-src` はありません。開発時だけ、Vite の `localhost:5173` と HMR 用に緩めています。

## Windows 実機で見てほしいこと

この環境では exe を起動していません。

- `meseta-ledger.exe` が開き、タイトルが「メセタ帳」で、ダッシュボードが描画される（CSP で白画面にならない）
- UTF-16LE のログフォルダを選ぶと件数が表示される
- Documents が OneDrive 配下（例: `C:\Users\<ユーザー>\OneDrive\Documents` や、ローカライズされたフォルダ名）でも、公式ログフォルダを読み込める
- 終了して再起動すると、同じフォルダが自動で読まれる（`data\log-folder.txt` ができる）
- その記録のパスが `\\?\` で始まっていない（通常の `C:\...` や `\\サーバ\共有`。OneDrive 配下でも同じ）
- 選んでいないフォルダは読めない
- exe のあるフォルダが書き込めるとき、隣に `data\webview` ができる
- 公式サイトへのリンクを押したときの挙動
- `pnpm dev:desktop` で Vite の画面が開く
- アイコンが付いている（クロスビルドではリソース埋め込みに警告が出た）
