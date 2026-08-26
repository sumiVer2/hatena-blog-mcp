import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEntryXml,
  parseCategories,
  parseEntry,
  parseFeed,
  parseServiceDocument,
} from "../src/hatena/atom.js";
import { buildWsseHeader } from "../src/hatena/wsse.js";

const FEED_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <link rel="first" href="https://blog.hatena.ne.jp/u/b.hatenablog.com/atom/entry" />
  <link rel="next" href="https://blog.hatena.ne.jp/u/b.hatenablog.com/atom/entry?page=1377584217" />
  <title>ブログタイトル</title>
  <link rel="alternate" href="http://b.hatenablog.com/"/>
  <updated>2013-08-27T15:17:06+09:00</updated>
  <author><name>u</name></author>
  <id>hatenablog://blog/2000000000000</id>
  <entry>
    <id>tag:blog.hatena.ne.jp,2013:blog-u-2000-3000</id>
    <link rel="edit" href="https://blog.hatena.ne.jp/u/b.hatenablog.com/atom/entry/2500000000"/>
    <link rel="alternate" type="text/html" href="http://b.hatenablog.com/entry/2013/09/02/112823"/>
    <author><name>u</name></author>
    <title>記事タイトル</title>
    <updated>2013-09-02T11:28:23+09:00</updated>
    <published>2013-09-02T11:28:23+09:00</published>
    <app:edited>2013-09-02T11:28:23+09:00</app:edited>
    <summary type="text">記事本文</summary>
    <content type="text/x-markdown">## 見出し
- リスト1</content>
    <hatena:formatted-content type="text/html" xmlns:hatena="http://www.hatena.ne.jp/info/xmlns#"><div class="section"><h4>記事本文</h4></div></hatena:formatted-content>
    <category term="Scala" />
    <category term="Perl" />
    <app:control>
      <app:draft>no</app:draft>
      <app:preview>no</app:preview>
    </app:control>
  </entry>
</feed>`;

const SINGLE_DRAFT_ENTRY_XML = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <id>tag:blog.hatena.ne.jp,2013:blog-u-2000-3000</id>
  <link rel="edit" href="https://blog.hatena.ne.jp/u/b.hatenablog.com/atom/entry/2500000001"/>
  <link rel="alternate" type="text/html" href="http://b.hatenablog.com/entry/draft"/>
  <link rel="preview" href="https://blog.hatena.ne.jp/u/b.hatenablog.com/preview/xyz"/>
  <author><name>u</name></author>
  <title>下書き &amp; テスト</title>
  <updated>2026-08-26T15:30:00+09:00</updated>
  <published>2026-08-26T15:30:00+09:00</published>
  <content type="text/x-markdown">a &lt; b</content>
  <category term="Ruby" />
  <app:control>
    <app:draft>yes</app:draft>
    <app:preview>yes</app:preview>
  </app:control>
</entry>`;

test("parseFeed は entry と次ページトークンを取り出す", () => {
  const result = parseFeed(FEED_XML, true);
  assert.equal(result.nextPage, "1377584217");
  assert.equal(result.entries.length, 1);

  const entry = result.entries[0]!;
  assert.equal(entry.entryId, "2500000000");
  assert.equal(entry.title, "記事タイトル");
  assert.equal(entry.url, "http://b.hatenablog.com/entry/2013/09/02/112823");
  assert.equal(entry.draft, false);
  assert.deepEqual(entry.categories, ["Scala", "Perl"]);
  assert.equal(entry.contentType, "text/x-markdown");
  assert.equal(entry.content, "## 見出し\n- リスト1");
});

test("parseFeed は include_content が false のとき本文を落とす", () => {
  const result = parseFeed(FEED_XML, false);
  assert.equal(result.entries[0]!.content, "");
  assert.equal(result.entries[0]!.summary, "記事本文");
});

test("最終ページでは nextPage が null になる", () => {
  const lastPage = FEED_XML.replace(/<link rel="next"[^>]*\/>/, "");
  assert.equal(parseFeed(lastPage, false).nextPage, null);
});

test("parseEntry は下書き・プレビュー URL・実体参照を扱う", () => {
  const entry = parseEntry(SINGLE_DRAFT_ENTRY_XML);
  assert.equal(entry.entryId, "2500000001");
  assert.equal(entry.title, "下書き & テスト");
  assert.equal(entry.content, "a < b");
  assert.equal(entry.draft, true);
  assert.equal(entry.previewShared, true);
  assert.equal(entry.previewUrl, "https://blog.hatena.ne.jp/u/b.hatenablog.com/preview/xyz");
  assert.deepEqual(entry.categories, ["Ruby"]);
  assert.equal(entry.formattedContent, undefined);
});

test("変換済み HTML は要求時のみ、生の文字列として返る", () => {
  const entry = parseEntry(FEED_XML.match(/<entry>[\s\S]*<\/entry>/)![0], true);
  assert.equal(entry.formattedContent, '<div class="section"><h4>記事本文</h4></div>');
});

test("parseCategories は名前空間接頭辞つきのカテゴリ文書を読む", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<app:categories xmlns:app="http://www.w3.org/2007/app" xmlns:atom="http://www.w3.org/2005/Atom" fixed="no">
  <atom:category term="Perl" />
  <atom:category term="Scala" />
</app:categories>`;
  assert.deepEqual(parseCategories(xml), ["Perl", "Scala"]);
});

test("parseServiceDocument はコレクション一覧を返す", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<service xmlns="http://www.w3.org/2007/app">
  <workspace>
    <atom:title xmlns:atom="http://www.w3.org/2005/Atom">ブログタイトル</atom:title>
    <collection href="https://blog.hatena.ne.jp/u/b.hatenablog.com/atom/entry">
      <atom:title xmlns:atom="http://www.w3.org/2005/Atom">記事一覧</atom:title>
      <accept>application/atom+xml;charset=utf-8;type=entry</accept>
    </collection>
  </workspace>
</service>`;
  const info = parseServiceDocument(xml);
  assert.equal(info.title, "ブログタイトル");
  assert.equal(info.collections.length, 1);
  assert.equal(info.collections[0]!.title, "記事一覧");
});

test("buildEntryXml は予約投稿とカスタム URL を出力する", () => {
  const xml = buildEntryXml({
    title: "タイトル<>&",
    content: "# 見出し\n本文",
    contentType: "text/x-markdown",
    updated: "2026-09-01T10:00:00+09:00",
    categories: ["Ruby", "Rails"],
    draft: true,
    scheduled: true,
    customUrl: "my-slug",
    previewShared: false,
  });

  assert.match(xml, /<title>タイトル&lt;&gt;&amp;<\/title>/);
  assert.match(xml, /<content type="text\/x-markdown"># 見出し\n本文<\/content>/);
  assert.match(xml, /<category term="Ruby" \/>/);
  assert.match(xml, /<category term="Rails" \/>/);
  assert.match(xml, /<app:draft>yes<\/app:draft>/);
  assert.match(xml, /<hatenablog:scheduled>yes<\/hatenablog:scheduled>/);
  assert.match(xml, /<hatenablog:custom-url>my-slug<\/hatenablog:custom-url>/);
});

test("buildEntryXml が生成した XML は再パースできる（往復）", () => {
  const xml = buildEntryXml({
    title: "R&D <script>",
    content: "a < b && c > d",
    updated: "2026-08-26T15:30:00+09:00",
    draft: false,
  });
  const entry = parseEntry(xml);
  assert.equal(entry.title, "R&D <script>");
  assert.equal(entry.content, "a < b && c > d");
  assert.equal(entry.draft, false);
});

test("buildWsseHeader は WSSE UsernameToken の書式を満たす", () => {
  const header = buildWsseHeader("my-id", "my-api-key");
  assert.match(
    header,
    /^UsernameToken Username="my-id", PasswordDigest="[A-Za-z0-9+/=]+", Nonce="[A-Za-z0-9+/=]+", Created="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"$/,
  );
});
