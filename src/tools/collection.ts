import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatenaClient } from "../hatena/client.js";
import type { CollectionKind, ContentType, EntryInput, HatenaEntry } from "../hatena/types.js";
import { isoWithLocalOffset, respond, summarize } from "./shared.js";

const contentTypeSchema = z
  .enum(["text/x-markdown", "text/x-hatena-syntax", "text/html", "text/plain"])
  .describe(
    "本文の記法。実際の解釈はブログの編集モード設定に従うため、ブログ側の設定と揃えること（既定: text/x-markdown）",
  );

interface CollectionSpec {
  kind: CollectionKind;
  /** ツール名の接尾辞（entry / page） */
  nameSuffix: string;
  /** 一覧系ツール名の接尾辞（entries / pages） */
  pluralSuffix: string;
  /** 説明文に使う日本語の呼称 */
  noun: string;
  /** カテゴリを扱えるコレクションか（固定ページはカテゴリ非対応） */
  supportsCategories: boolean;
  /** ツール説明の末尾に足す補足 */
  note?: string;
}

const ENTRY_SPEC: CollectionSpec = {
  kind: "entry",
  nameSuffix: "entry",
  pluralSuffix: "entries",
  noun: "ブログ記事",
  supportsCategories: true,
};

const PAGE_SPEC: CollectionSpec = {
  kind: "page",
  nameSuffix: "page",
  pluralSuffix: "pages",
  noun: "固定ページ",
  supportsCategories: false,
  note: "固定ページははてなブログの有料プランでのみ利用できる。無料プランでは 404 が返る。",
};

function withNote(description: string, spec: CollectionSpec): string {
  return spec.note ? `${description} ${spec.note}` : description;
}

interface EntryPatch {
  title?: string;
  content?: string;
  content_type?: ContentType;
  categories?: string[];
  draft?: boolean;
  updated?: string;
  custom_url?: string;
  preview_shared?: boolean;
}

/** 更新時は既存の記事を取得し、指定された項目だけを差し替える */
function mergeForUpdate(existing: HatenaEntry, patch: EntryPatch): EntryInput {
  return {
    title: patch.title ?? existing.title,
    content: patch.content ?? existing.content,
    contentType: patch.content_type ?? (existing.contentType as ContentType | undefined),
    updated: patch.updated ?? existing.updated ?? isoWithLocalOffset(),
    categories: patch.categories ?? existing.categories,
    draft: patch.draft ?? existing.draft,
    previewShared: patch.preview_shared ?? existing.previewShared,
    customUrl: patch.custom_url,
  };
}

export function registerCollectionTools(
  server: McpServer,
  client: HatenaClient,
  spec: CollectionSpec,
): void {
  const { kind, noun } = spec;

  server.registerTool(
    `list_${spec.pluralSuffix}`,
    {
      title: `${noun}一覧`,
      description: withNote(
        `${noun}を新しい順に一覧する。下書きも含まれる。1 ページあたりの件数は API 側で決まっており、` +
          `続きを読むには戻り値の next_page を page に渡す。本文まで読みたい場合は get_${spec.nameSuffix} を使う。`,
        spec,
      ),
      inputSchema: {
        page: z
          .string()
          .optional()
          .describe("次ページを取得するためのトークン。前回の戻り値の next_page を渡す"),
        include_content: z
          .boolean()
          .default(false)
          .describe("各件の本文を含めるか。true にすると出力が大きくなる"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ page, include_content }) =>
      respond(async () => {
        const result = await client.list(kind, page ?? null, include_content);
        return {
          entries: result.entries.map((entry) => summarize(entry, include_content)),
          next_page: result.nextPage,
        };
      }),
  );

  server.registerTool(
    `search_${spec.pluralSuffix}`,
    {
      title: `${noun}検索`,
      description: withNote(
        `${noun}をページを辿りながら検索する。タイトル・本文・カテゴリを対象に部分一致（大文字小文字は無視）。` +
          `はてなブログの API は一覧の 1 ページあたり件数が少ないため、まとめて探すときはこのツールを使う。` +
          `古い${noun}まで届かない場合は max_pages を増やす。`,
        spec,
      ),
      inputSchema: {
        query: z.string().optional().describe("タイトル・本文・カテゴリに対する検索語"),
        ...(spec.supportsCategories
          ? { category: z.string().optional().describe("カテゴリ名の完全一致で絞り込む") }
          : {}),
        status: z
          .enum(["all", "draft", "published"])
          .default("all")
          .describe("公開状態での絞り込み"),
        limit: z.number().int().min(1).max(100).default(20).describe("返す最大件数"),
        max_pages: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("走査する最大ページ数。多いほど古い記事まで届くが時間がかかる"),
        include_content: z.boolean().default(false).describe("結果に本文を含めるか"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const { query, status, limit, max_pages, include_content } = args as {
        query?: string;
        category?: string;
        status: "all" | "draft" | "published";
        limit: number;
        max_pages: number;
        include_content: boolean;
      };
      const category = (args as { category?: string }).category;

      return respond(async () => {
        const needle = query?.toLowerCase();
        const result = await client.collect(kind, {
          maxPages: max_pages,
          // 本文を対象に検索するため、query 指定時は本文の取得が必要
          includeContent: include_content || Boolean(needle),
          limit,
          match: (entry) => {
            if (status === "draft" && !entry.draft) return false;
            if (status === "published" && entry.draft) return false;
            if (category && !entry.categories.includes(category)) return false;
            if (!needle) return true;
            const haystack = [entry.title, entry.content, ...entry.categories]
              .join("\n")
              .toLowerCase();
            return haystack.includes(needle);
          },
        });

        return {
          entries: result.entries.map((entry) => summarize(entry, include_content)),
          scanned_pages: result.scannedPages,
          scanned_entries: result.scannedEntries,
          reached_end: result.reachedEnd,
          note: result.reachedEnd
            ? undefined
            : `走査は ${result.scannedPages} ページで打ち切った。さらに古い${noun}を探すには max_pages を増やす。`,
        };
      });
    },
  );

  server.registerTool(
    `get_${spec.nameSuffix}`,
    {
      title: `${noun}取得`,
      description: withNote(
        `${noun}を 1 件取得する。本文（登録記法のまま）・カテゴリ・公開状態を含む。編集前に必ずこれで現状を確認する。`,
        spec,
      ),
      inputSchema: {
        [`${spec.nameSuffix}_id`]: z
          .string()
          .describe(`${noun}の ID。一覧・検索の戻り値の ${spec.nameSuffix}Id、または編集 URL をそのまま渡してもよい`),
        include_formatted_content: z
          .boolean()
          .default(false)
          .describe("HTML に変換済みの本文も含めるか。出力がかなり大きくなる"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const id = (args as Record<string, string>)[`${spec.nameSuffix}_id`];
      const includeFormatted = (args as { include_formatted_content: boolean })
        .include_formatted_content;
      return respond(() => client.get(kind, id, includeFormatted));
    },
  );

  server.registerTool(
    `create_${spec.nameSuffix}`,
    {
      title: `${noun}作成`,
      description: withNote(
        `${noun}を新規作成する。既定では下書きとして作成されるので、公開する場合は draft を false にする。` +
          `予約投稿する場合は draft=true・scheduled=true と、未来日時の updated を指定する。`,
        spec,
      ),
      inputSchema: {
        title: z.string().describe("タイトル"),
        content: z.string().describe("本文。ブログの編集モードに合わせた記法で書く"),
        content_type: contentTypeSchema.optional(),
        ...(spec.supportsCategories
          ? {
              categories: z
                .array(z.string())
                .optional()
                .describe("カテゴリ名の配列。既存のカテゴリは list_categories で確認できる"),
            }
          : {}),
        draft: z.boolean().default(true).describe("下書きとして保存するか（既定: true）"),
        updated: z
          .string()
          .optional()
          .describe("投稿日時（ISO 8601、例: 2026-08-26T15:30:00+09:00）。省略時は現在時刻"),
        scheduled: z
          .boolean()
          .default(false)
          .describe("予約投稿にするか。draft=true かつ updated が未来日時のときに有効"),
        custom_url: z
          .string()
          .optional()
          .describe("カスタム URL（記事 URL のスラッグ部分）"),
        preview_shared: z
          .boolean()
          .default(false)
          .describe("下書きのプレビュー共有 URL を発行するか"),
      },
    },
    async (args) => {
      const input = args as {
        title: string;
        content: string;
        content_type?: ContentType;
        categories?: string[];
        draft: boolean;
        updated?: string;
        scheduled: boolean;
        custom_url?: string;
        preview_shared: boolean;
      };

      return respond(() =>
        client.create(kind, {
          title: input.title,
          content: input.content,
          contentType: input.content_type,
          updated: input.updated ?? isoWithLocalOffset(),
          categories: input.categories,
          draft: input.draft,
          scheduled: input.scheduled,
          customUrl: input.custom_url,
          previewShared: input.preview_shared,
        }),
      );
    },
  );

  server.registerTool(
    `update_${spec.nameSuffix}`,
    {
      title: `${noun}更新`,
      description: withNote(
        `${noun}を更新する。指定した項目だけを差し替える差分更新で、省略した項目は現在の値がそのまま残る。` +
          `下書きを公開するには draft=false を指定する。categories を渡すと現在のカテゴリは完全に置き換わる。`,
        spec,
      ),
      inputSchema: {
        [`${spec.nameSuffix}_id`]: z.string().describe(`更新する${noun}の ID`),
        title: z.string().optional().describe("新しいタイトル"),
        content: z.string().optional().describe("新しい本文（全文）"),
        content_type: contentTypeSchema.optional(),
        ...(spec.supportsCategories
          ? {
              categories: z
                .array(z.string())
                .optional()
                .describe("カテゴリ名の配列。指定すると既存のカテゴリを置き換える"),
            }
          : {}),
        draft: z.boolean().optional().describe("下書き状態。false にすると公開される"),
        updated: z
          .string()
          .optional()
          .describe("投稿日時（ISO 8601）。省略時は現在の投稿日時を維持する"),
        custom_url: z.string().optional().describe("カスタム URL。省略時は変更しない"),
        preview_shared: z.boolean().optional().describe("下書きのプレビュー共有 URL を発行するか"),
      },
    },
    async (args) => {
      const patch = args as EntryPatch & Record<string, string>;
      const id = patch[`${spec.nameSuffix}_id`];

      return respond(async () => {
        const existing = await client.get(kind, id);
        return client.update(kind, id, mergeForUpdate(existing, patch));
      });
    },
  );
}

export { ENTRY_SPEC, PAGE_SPEC };
