import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatenaClient } from "../hatena/client.js";
import { respond } from "./shared.js";

export function registerBlogTools(server: McpServer, client: HatenaClient): void {
  server.registerTool(
    "get_blog_info",
    {
      title: "ブログ情報取得",
      description:
        "接続先ブログのタイトルと、利用できるコレクション（記事・固定ページ）を取得する。" +
        "設定と認証が正しいかの疎通確認にも使える。固定ページのコレクションは有料プランでのみ返る。",
      annotations: { readOnlyHint: true },
    },
    async () => respond(() => client.getBlogInfo()),
  );

  server.registerTool(
    "list_categories",
    {
      title: "カテゴリ一覧",
      description:
        "ブログで使われているカテゴリの一覧を取得する。記事を作成・更新する前に、" +
        "既存のカテゴリ名と表記を揃えるために確認する。",
      annotations: { readOnlyHint: true },
    },
    async () => respond(async () => ({ categories: await client.listCategories() })),
  );
}
