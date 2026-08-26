import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HatenaClient } from "../src/hatena/client.js";
import { createServer } from "../src/server.js";

// URL のはてなID（所有者）と認証アカウントが異なる共有ブログの構成
const CONFIG = { hatenaId: "member", blogOwnerId: "owner", blogId: "b.hatenablog.com", apiKey: "key" };
const ROOT = "https://blog.hatena.ne.jp/owner/b.hatenablog.com/atom";

interface RecordedRequest {
  method: string;
  url: string;
  body: string | null;
  wsse: string | null;
}

let requests: RecordedRequest[] = [];
const originalFetch = globalThis.fetch;

function entryXml(options: {
  id: string;
  title: string;
  content: string;
  draft: "yes" | "no";
  categories: string[];
  updated: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <id>tag:blog.hatena.ne.jp,2013:blog-owner-1-${options.id}</id>
  <link rel="edit" href="${ROOT}/entry/${options.id}"/>
  <link rel="alternate" type="text/html" href="http://b.hatenablog.com/entry/${options.id}"/>
  <author><name>member</name></author>
  <title>${options.title}</title>
  <updated>${options.updated}</updated>
  <published>${options.updated}</published>
  <content type="text/x-markdown">${options.content}</content>
${options.categories.map((c) => `  <category term="${c}" />`).join("\n")}
  <app:control>
    <app:draft>${options.draft}</app:draft>
    <app:preview>no</app:preview>
  </app:control>
</entry>`;
}

const EXISTING_ENTRY = {
  id: "111",
  title: "既存のタイトル",
  content: "既存の本文",
  draft: "yes" as const,
  categories: ["Ruby", "Rails"],
  updated: "2026-08-01T10:00:00+09:00",
};

/** はてなブログ AtomPub を模したレスポンスを返す */
function fakeHatena(url: string, method: string): { status: number; body: string } {
  if (method === "GET" && url === `${ROOT}/entry/111`) {
    return { status: 200, body: entryXml(EXISTING_ENTRY) };
  }
  if (method === "PUT" && url === `${ROOT}/entry/111`) {
    return { status: 200, body: entryXml({ ...EXISTING_ENTRY, draft: "no" }) };
  }
  if (method === "POST" && url === `${ROOT}/entry`) {
    return { status: 201, body: entryXml({ ...EXISTING_ENTRY, id: "222" }) };
  }
  if (method === "GET" && url === `${ROOT}/entry/404`) {
    return { status: 404, body: "<error>Not Found</error>" };
  }
  if (method === "GET" && url.startsWith(`${ROOT}/entry`)) {
    const page = new URL(url).searchParams.get("page");
    const next = page ? "" : `<link rel="next" href="${ROOT}/entry?page=2"/>`;
    return {
      status: 200,
      body: `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  ${next}
  <title>ブログ</title>
  ${entryXml(page ? { ...EXISTING_ENTRY, id: "999", title: "古い記事", content: "Terraform の話" } : EXISTING_ENTRY).replace(/<\?xml[^>]*\?>/, "")}
</feed>`,
    };
  }
  return { status: 500, body: `unexpected request: ${method} ${url}` };
}

beforeEach(() => {
  requests = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      method,
      url,
      body: (init?.body as string | undefined) ?? null,
      wsse: (init?.headers as Record<string, string> | undefined)?.["X-WSSE"] ?? null,
    });
    const { status, body } = fakeHatena(url, method);
    return new Response(body, { status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function connect() {
  const server = createServer(new HatenaClient(CONFIG));
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function firstText(result: unknown): string {
  return (result as { content: Array<{ text: string }> }).content[0]!.text;
}

test("削除ツールは公開されていない", async () => {
  const client = await connect();
  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, [
    "create_entry",
    "create_page",
    "get_blog_info",
    "get_entry",
    "get_page",
    "list_categories",
    "list_entries",
    "list_pages",
    "search_entries",
    "search_pages",
    "update_entry",
    "update_page",
  ]);
  assert.ok(!names.some((name) => name.includes("delete")));
});

test("記事ツールにはカテゴリがあり、固定ページツールにはない", async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;
  const properties = (name: string) =>
    Object.keys((tools.find((t) => t.name === name)!.inputSchema.properties ?? {}) as object);

  assert.ok(properties("create_entry").includes("categories"));
  assert.ok(!properties("create_page").includes("categories"));
  assert.ok(properties("update_entry").includes("entry_id"));
  assert.ok(properties("update_page").includes("page_id"));
});

test("URL は所有者、WSSE 認証は操作者のアカウントを使う", async () => {
  const client = await connect();
  await client.callTool({ name: "get_entry", arguments: { entry_id: "111" } });

  assert.equal(requests.length, 1);
  // 共有ブログでは所有者と操作者が異なる
  assert.equal(requests[0]!.url, "https://blog.hatena.ne.jp/owner/b.hatenablog.com/atom/entry/111");
  assert.match(requests[0]!.wsse!, /^UsernameToken Username="member", PasswordDigest="/);
});

test("update_entry は取得してから差分だけを送る", async () => {
  const client = await connect();
  const result = await client.callTool({
    name: "update_entry",
    arguments: { entry_id: "111", draft: false },
  });

  assert.deepEqual(
    requests.map((request) => request.method),
    ["GET", "PUT"],
  );

  const body = requests[1]!.body!;
  // 指定していない項目は取得した現在の値が維持される
  assert.match(body, /<title>既存のタイトル<\/title>/);
  assert.match(body, /<content type="text\/x-markdown">既存の本文<\/content>/);
  assert.match(body, /<updated>2026-08-01T10:00:00\+09:00<\/updated>/);
  assert.match(body, /<category term="Ruby" \/>/);
  assert.match(body, /<category term="Rails" \/>/);
  // 指定した項目だけが変わる
  assert.match(body, /<app:draft>no<\/app:draft>/);

  assert.equal(JSON.parse(firstText(result)).draft, false);
});

test("update_entry の categories 指定は既存カテゴリを置き換える", async () => {
  const client = await connect();
  await client.callTool({
    name: "update_entry",
    arguments: { entry_id: "111", title: "新しいタイトル", categories: ["Go"] },
  });

  const body = requests[1]!.body!;
  assert.match(body, /<title>新しいタイトル<\/title>/);
  assert.match(body, /<category term="Go" \/>/);
  assert.ok(!body.includes('term="Ruby"'));
});

test("create_entry は既定で下書きになる", async () => {
  const client = await connect();
  await client.callTool({
    name: "create_entry",
    arguments: { title: "新規", content: "本文" },
  });

  const body = requests[0]!.body!;
  assert.match(body, /<app:draft>yes<\/app:draft>/);
  assert.match(body, /<content type="text\/x-markdown">本文<\/content>/);
  // updated は省略時に現在時刻が入る
  assert.match(body, /<updated>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}<\/updated>/);
});

test("search_entries はページを辿って本文まで検索する", async () => {
  const client = await connect();
  const result = await client.callTool({
    name: "search_entries",
    arguments: { query: "terraform", max_pages: 3 },
  });

  const payload = JSON.parse(firstText(result));
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.entries[0].title, "古い記事");
  assert.equal(payload.scanned_pages, 2);
  assert.equal(payload.reached_end, true);
});

test("API エラーはステータス付きのエラー結果になる", async () => {
  const client = await connect();
  const result = await client.callTool({ name: "get_entry", arguments: { entry_id: "404" } });

  assert.equal((result as { isError?: boolean }).isError, true);
  assert.match(firstText(result), /404/);
});
