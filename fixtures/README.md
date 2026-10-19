# テスト用ログ

ここにあるログは、解析レポートの列の形に合わせた**合成データ**です。ゲームクライアントが書き出したファイルではありません。

## ルール

- キャラクターは `00000000` / `テストキャラ` だけにする。実在のプレイヤー名、プレイヤー ID、キャラクター ID は入れない。
- ChatLog と SymbolChatLog はファイルとして置かない。種別判定のテストは、メモリ上の短い行だけで行う。
- `src/` は人が読める UTF-8。`logs/` はゲームログと同じ **UTF-16LE（BOM あり）・CRLF・タブ区切り**。Git にはバイナリとして入れ、改行を変換させない（リポジトリ直下の `.gitattributes`）。
- `logs/` は `packages/core/test/sampleLines.ts` から生成する。内容を変えたら、次で作り直す。

```powershell
node packages/core/test/writeFixtures.ts
```

Node.js 24 なら TypeScript をそのまま実行できる。テストは `sampleLines.ts` と `logs/` の一致も見ている。
