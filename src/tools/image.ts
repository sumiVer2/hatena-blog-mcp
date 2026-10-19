import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatenaClient } from "../hatena/client.js";
import { detectImageContentType } from "../hatena/fotolife.js";
import { respond } from "./shared.js";

/** ブログの編集画面からアップロードしたときと同じフォルダ */
const DEFAULT_FOLDER = "Hatena Blog";

/**
 * 読み込み前に弾くサイズの上限。フォトライフ側の上限ではなく、
 * 誤って巨大なファイルを渡したときに base64 化でメモリを使い切らないための安全弁
 */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function registerImageTools(server: McpServer, client: HatenaClient): void {
  server.registerTool(
    "upload_image",
    {
      title: "画像アップロード",
      description:
        "ローカルの画像をはてなフォトライフにアップロードし、記事本文に貼れる記法（embed）を返す。" +
        "embed は Markdown・はてな記法の編集モード向け。見たままモードのブログでは imageUrl を使う。" +
        "画像は認証アカウント（HATENA_ID）のフォトライフに保存され、URL を知っていれば誰でも見られる。" +
        "社外に出してよい画像だけを渡すこと。アップロードした画像の削除はブラウザから行う。",
      inputSchema: {
        file_path: z.string().describe("アップロードする画像ファイルの絶対パス（PNG / JPEG / GIF）"),
        title: z.string().optional().describe("フォトライフ上の画像タイトル。省略時はファイル名"),
        folder: z
          .string()
          .optional()
          .describe(`保存先のフォルダ名。存在しなければ作られる（既定: ${DEFAULT_FOLDER}）`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ file_path, title, folder }) =>
      respond(async () => {
        if (!isAbsolute(file_path)) {
          throw new Error(`file_path は絶対パスで指定してください: ${file_path}`);
        }
        const stats = await stat(file_path);
        // デバイスファイルや FIFO は size が 0 になり上限を素通りするため、通常のファイル以外は先に弾く
        if (!stats.isFile()) {
          throw new Error(`通常のファイルではありません: ${file_path}`);
        }
        if (stats.size > MAX_FILE_BYTES) {
          throw new Error(`ファイルが大きすぎます（${stats.size} バイト）。上限は ${MAX_FILE_BYTES} バイト`);
        }
        const data = await readFile(file_path);
        return client.uploadImage({
          title: title?.trim() || basename(file_path),
          data,
          contentType: detectImageContentType(data),
          folder: folder?.trim() || DEFAULT_FOLDER,
        });
      }),
  );
}
