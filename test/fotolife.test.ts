import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImageEntryXml, detectImageContentType, parseImageEntry } from "../src/hatena/fotolife.js";

test("先頭のシグネチャで画像形式を判定する", () => {
  assert.equal(detectImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageContentType(Buffer.from("GIF89a")), "image/gif");
  assert.throws(() => detectImageContentType(Buffer.from("plain text")), /画像ファイルではない/);
  assert.throws(() => detectImageContentType(Buffer.alloc(0)), /画像ファイルではない/);
});

test("投稿 XML のタイトルとフォルダはエスケープする", () => {
  const xml = buildImageEntryXml({
    title: "<a & b>",
    data: Buffer.from("x"),
    contentType: "image/png",
    folder: 'blog "images"',
  });

  assert.match(xml, /<title>&lt;a &amp; b&gt;<\/title>/);
  assert.match(xml, /<dc:subject>blog &quot;images&quot;<\/dc:subject>/);
});

test("hatena:syntax がないレスポンスはエラーにする", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://purl.org/atom/ns#"><title>x</title></entry>`;

  assert.throws(() => parseImageEntry(xml), /hatena:syntax/);
});
