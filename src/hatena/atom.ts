import { XMLParser } from "fast-xml-parser";
import type { BlogInfo, EntryInput, EntryList, HatenaEntry } from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) => ["entry", "category", "link", "collection", "workspace"].includes(name),
  // 変換済み HTML は子要素として解釈させず、生の文字列のまま取り出す
  stopNodes: ["*.hatena:formatted-content"],
});

type XmlNode = Record<string, any>;

function text(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node === "object" && "#text" in (node as XmlNode)) {
    const value = (node as XmlNode)["#text"];
    return value == null ? null : String(value);
  }
  return null;
}

function trimmed(node: unknown): string | null {
  return text(node)?.trim() ?? null;
}

function isYes(node: unknown): boolean {
  return trimmed(node) === "yes";
}

function findLink(entry: XmlNode, rel: string): string | null {
  const links: XmlNode[] = entry.link ?? [];
  const match = links.find((link) => link["@_rel"] === rel);
  return match?.["@_href"] ?? null;
}

/** 編集 URI（.../atom/entry/12345）から末尾の ID を取り出す */
function entryIdFromEditUrl(editUrl: string | null): string {
  if (!editUrl) return "";
  return editUrl.split("/").pop() ?? "";
}

function parseEntryNode(entry: XmlNode, includeFormattedContent: boolean): HatenaEntry {
  const control: XmlNode = entry["app:control"] ?? {};
  const categories: XmlNode[] = entry.category ?? [];
  const content = entry.content ?? {};
  const editUrl = findLink(entry, "edit");

  const result: HatenaEntry = {
    id: trimmed(entry.id) ?? "",
    entryId: entryIdFromEditUrl(editUrl),
    title: trimmed(entry.title) ?? "",
    url: findLink(entry, "alternate"),
    editUrl,
    previewUrl: findLink(entry, "preview"),
    author: trimmed(entry.author?.name),
    published: trimmed(entry.published),
    updated: trimmed(entry.updated),
    edited: trimmed(entry["app:edited"]),
    draft: isYes(control["app:draft"]),
    previewShared: isYes(control["app:preview"]),
    categories: categories.map((c) => c["@_term"]).filter((t): t is string => Boolean(t)),
    contentType: content["@_type"] ?? null,
    content: text(content) ?? "",
    summary: trimmed(entry.summary),
  };

  if (includeFormattedContent) {
    result.formattedContent = text(entry["hatena:formatted-content"]) ?? "";
  }
  return result;
}

export function parseEntry(xml: string, includeFormattedContent = false): HatenaEntry {
  const doc = parser.parse(xml);
  const entry = doc.entry?.[0] ?? doc.entry;
  if (!entry) throw new Error("レスポンスに entry 要素が見つかりませんでした");
  return parseEntryNode(entry, includeFormattedContent);
}

export function parseFeed(xml: string, includeContent: boolean): EntryList {
  const doc = parser.parse(xml);
  const feed: XmlNode = doc.feed ?? {};
  const entries: XmlNode[] = feed.entry ?? [];

  const parsed = entries.map((entry) => {
    const item = parseEntryNode(entry, false);
    if (!includeContent) {
      return { ...item, content: "" };
    }
    return item;
  });

  return { entries: parsed, nextPage: nextPageToken(feed) };
}

/** rel="next" のリンクから page パラメータを取り出す */
function nextPageToken(feed: XmlNode): string | null {
  const links: XmlNode[] = feed.link ?? [];
  const next = links.find((link) => link["@_rel"] === "next")?.["@_href"];
  if (!next) return null;
  try {
    return new URL(next).searchParams.get("page");
  } catch {
    return null;
  }
}

export function parseCategories(xml: string): string[] {
  const doc = parser.parse(xml);
  const categories: XmlNode[] = doc["app:categories"]?.category ?? doc["app:categories"]?.["atom:category"] ?? [];
  const list = Array.isArray(categories) ? categories : [categories];
  return list.map((c) => c["@_term"]).filter((t): t is string => Boolean(t));
}

export function parseServiceDocument(xml: string): BlogInfo {
  const doc = parser.parse(xml);
  const workspace: XmlNode = doc.service?.workspace?.[0] ?? doc.service?.workspace ?? {};
  const collections: XmlNode[] = workspace.collection ?? [];

  return {
    title: trimmed(workspace["atom:title"]) ?? trimmed(workspace.title) ?? "",
    collections: collections.map((collection) => ({
      title: trimmed(collection["atom:title"]) ?? trimmed(collection.title) ?? "",
      href: collection["@_href"] ?? "",
      accept: trimmed(collection.accept),
    })),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildEntryXml(input: EntryInput): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<entry xmlns="http://www.w3.org/2005/Atom"',
    '       xmlns:app="http://www.w3.org/2007/app"',
    '       xmlns:hatenablog="http://www.hatena.ne.jp/info/xmlns#hatenablog">',
    `  <title>${escapeXml(input.title)}</title>`,
  ];

  if (input.author) {
    lines.push(`  <author><name>${escapeXml(input.author)}</name></author>`);
  }

  const contentType = input.contentType ?? "text/x-markdown";
  lines.push(`  <content type="${escapeXml(contentType)}">${escapeXml(input.content)}</content>`);
  lines.push(`  <updated>${escapeXml(input.updated)}</updated>`);

  for (const category of input.categories ?? []) {
    lines.push(`  <category term="${escapeXml(category)}" />`);
  }

  lines.push("  <app:control>");
  lines.push(`    <app:draft>${input.draft ? "yes" : "no"}</app:draft>`);
  lines.push(`    <app:preview>${input.previewShared ? "yes" : "no"}</app:preview>`);
  if (input.scheduled) {
    lines.push("    <hatenablog:scheduled>yes</hatenablog:scheduled>");
  }
  lines.push("  </app:control>");

  if (input.customUrl) {
    lines.push(`  <hatenablog:custom-url>${escapeXml(input.customUrl)}</hatenablog:custom-url>`);
  }

  lines.push("</entry>");
  return lines.join("\n");
}
