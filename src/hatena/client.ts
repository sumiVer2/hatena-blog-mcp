import type { HatenaConfig } from "../config.js";
import {
  buildEntryXml,
  parseCategories,
  parseEntry,
  parseFeed,
  parseServiceDocument,
} from "./atom.js";
import type {
  BlogInfo,
  CollectionKind,
  EntryInput,
  EntryList,
  HatenaEntry,
} from "./types.js";
import { buildWsseHeader } from "./wsse.js";

export class HatenaApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly url: string,
    readonly body: string,
  ) {
    super(`はてなブログ API エラー ${status} (${method} ${url})\n${body.slice(0, 1000)}`);
    this.name = "HatenaApiError";
  }
}

export class HatenaClient {
  private readonly rootUrl: string;

  constructor(private readonly config: HatenaConfig) {
    this.rootUrl = `https://blog.hatena.ne.jp/${encodeURIComponent(config.hatenaId)}/${encodeURIComponent(config.blogId)}/atom`;
  }

  private async request(method: string, url: string, body?: string): Promise<string> {
    const response = await fetch(url, {
      method,
      headers: {
        "X-WSSE": buildWsseHeader(this.config.hatenaId, this.config.apiKey),
        Accept: "application/x.atom+xml, application/atom+xml, application/xml, text/xml, */*",
        ...(body ? { "Content-Type": "application/atom+xml;type=entry" } : {}),
      },
      body,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new HatenaApiError(response.status, method, url, responseText);
    }
    return responseText;
  }

  private collectionUrl(kind: CollectionKind, page?: string | null): string {
    const url = new URL(`${this.rootUrl}/${kind}`);
    if (page) url.searchParams.set("page", page);
    return url.toString();
  }

  /**
   * 編集 URI そのものが渡された場合も受け付けられるよう、末尾の ID だけを取り出す。
   */
  private memberUrl(kind: CollectionKind, entryId: string): string {
    const id = entryId.includes("/") ? entryId.split("/").pop()! : entryId;
    if (!id) throw new Error("entry_id が空です");
    return `${this.rootUrl}/${kind}/${encodeURIComponent(id)}`;
  }

  async getBlogInfo(): Promise<BlogInfo> {
    return parseServiceDocument(await this.request("GET", this.rootUrl));
  }

  async listCategories(): Promise<string[]> {
    return parseCategories(await this.request("GET", `${this.rootUrl}/category`));
  }

  async list(kind: CollectionKind, page: string | null, includeContent: boolean): Promise<EntryList> {
    return parseFeed(await this.request("GET", this.collectionUrl(kind, page)), includeContent);
  }

  async get(
    kind: CollectionKind,
    entryId: string,
    includeFormattedContent = false,
  ): Promise<HatenaEntry> {
    const xml = await this.request("GET", this.memberUrl(kind, entryId));
    return parseEntry(xml, includeFormattedContent);
  }

  async create(kind: CollectionKind, input: EntryInput): Promise<HatenaEntry> {
    const xml = await this.request("POST", this.collectionUrl(kind), buildEntryXml(input));
    return parseEntry(xml);
  }

  async update(kind: CollectionKind, entryId: string, input: EntryInput): Promise<HatenaEntry> {
    const xml = await this.request("PUT", this.memberUrl(kind, entryId), buildEntryXml(input));
    return parseEntry(xml);
  }

  /**
   * 全件走査。AtomPub の一覧は 1 ページあたり件数が少ないため、
   * ページを辿りながら条件に合うものだけを集める。
   */
  async collect(
    kind: CollectionKind,
    options: {
      maxPages: number;
      includeContent: boolean;
      match: (entry: HatenaEntry) => boolean;
      limit: number;
    },
  ): Promise<{ entries: HatenaEntry[]; scannedPages: number; scannedEntries: number; reachedEnd: boolean }> {
    const matched: HatenaEntry[] = [];
    let page: string | null = null;
    let scannedPages = 0;
    let scannedEntries = 0;
    let reachedEnd = false;

    while (scannedPages < options.maxPages) {
      const result: EntryList = await this.list(kind, page, options.includeContent);
      scannedPages += 1;
      scannedEntries += result.entries.length;

      for (const entry of result.entries) {
        if (options.match(entry)) matched.push(entry);
      }

      if (matched.length >= options.limit || !result.nextPage) {
        reachedEnd = !result.nextPage;
        break;
      }
      page = result.nextPage;
    }

    return {
      entries: matched.slice(0, options.limit),
      scannedPages,
      scannedEntries,
      reachedEnd,
    };
  }
}
