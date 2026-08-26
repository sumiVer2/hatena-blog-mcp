import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatenaClient } from "./hatena/client.js";
import { registerBlogTools } from "./tools/blog.js";
import { ENTRY_SPEC, PAGE_SPEC, registerCollectionTools } from "./tools/collection.js";

const INSTRUCTIONS = [
  "はてなブログの記事を AtomPub API 経由で作成・更新するためのサーバー。",
  "記事を編集するときは、まず get_entry で現在の本文を取得してから update_entry を呼ぶこと。",
  "update_entry は差分更新で、省略した項目は現在の値が維持される。",
  "新規作成は既定で下書きになる。公開・予約投稿はユーザーの明示的な指示があるときだけ行うこと。",
  "削除は意図的にサポートしていない。",
].join("");

export function createServer(client: HatenaClient): McpServer {
  const server = new McpServer(
    { name: "hatena-blog", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  registerBlogTools(server, client);
  registerCollectionTools(server, client, ENTRY_SPEC);
  registerCollectionTools(server, client, PAGE_SPEC);

  return server;
}
