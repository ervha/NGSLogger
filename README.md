## いま動くこと

- UTF-16LE（BOM あり・なし）のデコードと、チャンクの境界で文字や行が割れない処理
- 中身による種別判定（ActionLog / RewardLog / ScratchLog / 通貨系 / ChatLog / SymbolChatLog / 未対応）
- ActionLog のパース（SetValue 行の列ずれ、金額行、`[DiscradExchange]` の綴り）
- 合成ログでのマイショップ購入、NPC 購入の差分、売却推定のテスト（最大40件の枝刈り探索）
- **メセタ収支 & マイショップ売却分析ダッシュボード**:
  - 純利益・総収入・総支出・マイショップ売上受取額（および手数料引かれ額）のKPI表示
  - 日別収支推移（収入・支出・純利益）のバー・ライン複合グラフ（ECharts）
  - 日別収支内訳テーブル（換金、ショップ購入、NPC購入等の内訳）
  - マイショップ出品状況（出品中・売却推定・取下済・未特定）および売却推定アイテム一覧
- **チャット履歴の遡り確認（オプトイン）**:
  - 初期値はオフ（プライバシー保護）。トグルをオンにすることで、ChatLog の本文をパースし、チャンネル絞り込み・キーワード検索・日時順ソートで履歴を遡り確認可能。
  - **注目ワード強調機能**: プレイヤー名や募集単語などをカンマ区切りで指定し、マッチした発言を強調表示。
- **ポータブル版でのログフォルダ自動読み取り & リアルタイム監視**:
  - 選択したログフォルダのパスを記憶し、次回以降起動時に自動スキャン＆読み込み。
  - プレイ中のログ追記を自動検知して画面を同期するリアルタイム監視トグル。
- **データのバックアップ保存・復元**:
  - 現在の集計結果と設定を JSON ファイルとしてワンクリックでエクスポート / インポート。
- GitHub Pages による Web 版の自動公開（main へのプッシュで自動デプロイ）
- GitHub Releases による Windows デスクトップ版（単体ポータブル exe および zip）の配布ワークフロー

## ダウンロード（Windows 向けポータブル版）

[Releases](https://github.com/ervha/NGSLogger/releases/latest) からダウンロードしてご利用いただけます。

- **`MesetaLedger-v*-windows-x64.exe`**: インストール不要でそれ単体で完結して動作するポータブル版実行ファイルです。
- **`MesetaLedger-v*-windows-x64.zip`**: exe に加えて README やドキュメントを同梱した zip アーカイブです。

Web 版（インストール不要・ブラウザ動作）: [https://ervha.github.io/NGSLogger/](https://ervha.github.io/NGSLogger/)

## デスクトップ版をビルドする

画面は Web 版と同じで、Tauri 2 が包みます。インストーラは作らず、exe だけ出します。前提と Windows 実機で残っている確認は [docs/desktop-build.md](docs/desktop-build.md) です。

```powershell
pnpm install --frozen-lockfile
pnpm dev:desktop
pnpm build:desktop
```

Windows では `apps/desktop/src-tauri/target/release/meseta-ledger.exe` ができます。

まだ無いもの: データベースへの永続保存。Windows 実機での起動とログ読み込みの確認。
