import { escapeXml, findLink, parseXml, trimmed, type XmlNode } from "./atom.js";
import type { UploadedImage, UploadImageInput } from "./types.js";

/**
 * はてなフォトライフが受け付ける画像形式を、ファイル先頭のシグネチャで判定する。
 * 拡張子では判定しない。名前だけ .png にした画像以外のファイル（秘密鍵など）を
 * 公開されるフォトライフに送ってしまわないようにするため。
 */
const IMAGE_SIGNATURES: Array<{ contentType: string; bytes: number[] }> = [
  { contentType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { contentType: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

export function detectImageContentType(data: Buffer): string {
  const match = IMAGE_SIGNATURES.find(({ bytes }) => bytes.every((byte, i) => data[i] === byte));
  if (!match) {
    throw new Error("画像ファイルではないか、対応していない画像形式です。対応形式: PNG / JPEG / GIF");
  }
  return match.contentType;
}

/** フォトライフの PostURI は Atom 0.3 の entry を受け付ける */
export function buildImageEntryXml(input: UploadImageInput): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<entry xmlns="http://purl.org/atom/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `  <title>${escapeXml(input.title)}</title>`,
    `  <content mode="base64" type="${escapeXml(input.contentType)}">${input.data.toString("base64")}</content>`,
    `  <dc:subject>${escapeXml(input.folder)}</dc:subject>`,
    "  <generator>hatena-blog-mcp</generator>",
    "</entry>",
  ].join("\n");
}

export function parseImageEntry(xml: string): UploadedImage {
  const doc = parseXml(xml);
  const entry: XmlNode | undefined = doc.entry?.[0] ?? doc.entry;
  if (!entry) throw new Error("レスポンスに entry 要素が見つかりませんでした");

  const syntax = trimmed(entry["hatena:syntax"]);
  if (!syntax) throw new Error("レスポンスに hatena:syntax が見つかりませんでした");

  return {
    syntax,
    // ブログの編集画面が挿入するのと同じ :plain 形式にする（:image だとフォトライフへのリンクが付く）
    embed: `[${syntax.replace(/:image$/, ":plain")}]`,
    imageUrl: trimmed(entry["hatena:imageurl"]),
    imageUrlSmall: trimmed(entry["hatena:imageurlsmall"]),
    pageUrl: findLink(entry, "alternate"),
    editUrl: findLink(entry, "service.edit"),
  };
}
