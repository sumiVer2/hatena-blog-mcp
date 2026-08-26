# hatena-blog-mcp

はてなブログの記事を作成・更新するための MCP サーバー。
[はてなブログ AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) を薄くラップし、
AI エージェントから記事の下書き・推敲・公開を扱えるようにする。

## セットアップ

パッケージマネージャは **pnpm** を使う（`packageManager` フィールドで固定）。

```bash
pnpm install   # 依存のインストールと同時に prepare で dist がビルドされる
```

### API キーの取得

はてなブログの **[設定] > [詳細設定] > [AtomPub]** から「ルートエンドポイント」と「API キー」を確認する。

- `HATENA_ID`: ルートエンドポイントの `https://blog.hatena.ne.jp/{はてなID}/...` の部分
- `HATENA_BLOG_ID`: 同じく `{ブログID}` の部分（例: `tech.example.hatenablog.com`）
  - 有料プランで独自ドメインを使っている場合も、**独自ドメイン設定前のドメイン**を指定する
- `HATENA_API_KEY`: API キー

`.env.example` を参照。

### MCP クライアントへの登録

Claude Code の場合:

```bash
claude mcp add hatena-blog \
  --env HATENA_ID=your-hatena-id \
  --env HATENA_BLOG_ID=your-blog.hatenablog.com \
  --env HATENA_API_KEY=your-api-key \
  -- node /absolute/path/to/tech-blog/dist/index.js
```

設定ファイルに直接書く場合:

```json
{
  "mcpServers": {
    "hatena-blog": {
      "command": "node",
      "args": ["/absolute/path/to/tech-blog/dist/index.js"],
      "env": {
        "HATENA_ID": "your-hatena-id",
        "HATENA_BLOG_ID": "your-blog.hatenablog.com",
        "HATENA_API_KEY": "your-api-key"
      }
    }
  }
}
```

登録できたら `get_blog_info` を呼ぶと疎通確認になる。

## ツール

### ブログ全体

| ツール | 説明 |
| --- | --- |
| `get_blog_info` | ブログタイトルと利用可能なコレクションを取得（疎通確認にも使える） |
| `list_categories` | ブログで使われているカテゴリ一覧 |

### 記事

| ツール | 説明 |
| --- | --- |
| `list_entries` | 記事を新しい順に一覧（下書きを含む）。`next_page` で続きを取得 |
| `search_entries` | ページを辿ってタイトル・本文・カテゴリを部分一致検索 |
| `get_entry` | 記事を 1 件取得（本文は登録記法のまま） |
| `create_entry` | 記事を新規作成（**既定は下書き**） |
| `update_entry` | 記事を差分更新 |

### 固定ページ

`list_pages` / `search_pages` / `get_page` / `create_page` / `update_page` が記事と同じ形で用意されている。
**固定ページははてなブログの有料プランでのみ利用できる**（無料プランでは 404 が返る）。
固定ページはカテゴリを持たないため、`categories` パラメータはない。

## 設計上の決めごと

### 削除は実装しない

記事・固定ページの削除（`DELETE`）は API 側にはあるが、意図的にツールとして公開していない。
誤操作の影響が大きく、取り消せないため。削除はブラウザから行う。

### `update_entry` は差分更新

AtomPub の `PUT` は「送った内容で全体を置き換える」ため、タイトルだけ直すつもりでも
本文・カテゴリ・投稿日時をすべて送り直す必要がある。
このサーバーは `update_entry` の中で **GET してから指定された項目だけを差し替えて PUT** している。

- 省略した項目は現在の値がそのまま維持される
- `updated` を省略すると記事の投稿日時（表示される日付）は変わらない
- `categories` を渡した場合は**置き換え**になる（追加ではない）。既存カテゴリを残したいときは既存分も含めて渡す

### 新規作成は既定で下書き

`create_entry` の `draft` は既定 `true`。エージェントの操作でいきなり記事が公開されるのを避けるため、
公開は明示的に `draft: false` を指定したときだけ行われる。

### 本文の記法

`content_type` には `text/x-markdown` / `text/x-hatena-syntax` / `text/html` / `text/plain` を指定できる（既定は `text/x-markdown`）。
ただし**実際にどう解釈されるかはブログ側の「編集モード」設定に従う**ため、ブログの設定と揃えて書く必要がある。
既存記事の更新では、編集前の記法が引き継がれる。

### 予約投稿

`create_entry` で `draft: true` + `scheduled: true` + 未来日時の `updated` を指定する。

### 一覧のページング

はてなブログの API は 1 ページあたりの件数が少ない（記事は 7 件、固定ページは 10 件）。
`list_entries` は 1 ページ分を返し、`next_page` を次の呼び出しの `page` に渡すと続きが取れる。
まとめて探したいときは、内部でページを辿る `search_entries` を使う。`max_pages` で走査量を制御する。

### 認証

WSSE 認証（`X-WSSE` ヘッダ）を使う。リクエストごとに Nonce と Created を生成し、
`Base64(SHA1(Nonce + Created + APIキー))` を PasswordDigest として送る。

### スコープ外

- **画像のアップロード**: AtomPub の範囲外（[はてなフォトライフ API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom) が別にある）
- **固定ページのレイアウト変更**: API 非対応。ブラウザから設定する
- **OAuth 認証**: API キーによる WSSE 認証のみ対応

## 開発

```bash
pnpm run typecheck   # 型チェック
pnpm test            # ユニットテスト（API はモック）
pnpm run build       # dist へビルド
pnpm run dev         # ビルドせずに起動
pnpm run inspect     # MCP Inspector で手動確認
```

pnpm 10 は依存のビルドスクリプトを既定でブロックするため、`tsx` が使う `esbuild` だけを
`package.json` の `pnpm.onlyBuiltDependencies` で許可している。

### 構成

```
src/
  index.ts          エントリポイント（stdio トランスポート）
  server.ts         McpServer の組み立て
  config.ts         環境変数の読み込み
  hatena/
    client.ts       AtomPub の HTTP クライアント
    wsse.ts         WSSE 認証ヘッダの生成
    atom.ts         Atom XML のパース・生成
    types.ts        ドメイン型
  tools/
    blog.ts         ブログ全体に対するツール
    collection.ts   記事・固定ページ共通のツール定義
    shared.ts       ツールの共通ヘルパー
```

記事と固定ページは AtomPub 上ほぼ同じ構造なので、`tools/collection.ts` の
`registerCollectionTools` を記事用・固定ページ用の 2 通りの設定で呼び分けている。

## ライセンス

MIT License. 詳細は [LICENSE](./LICENSE) を参照。
