import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

const BASE = {
  HATENA_ID: "member",
  HATENA_BLOG_ID: "owner.hatenablog.com",
  HATENA_API_KEY: "key",
};

test("HATENA_BLOG_OWNER_ID 省略時は HATENA_ID を所有者として使う", () => {
  const config = loadConfig(BASE);
  assert.equal(config.hatenaId, "member");
  assert.equal(config.blogOwnerId, "member");
});

test("共有ブログでは所有者と認証アカウントを別に持てる", () => {
  const config = loadConfig({ ...BASE, HATENA_BLOG_OWNER_ID: "owner" });
  assert.equal(config.hatenaId, "member");
  assert.equal(config.blogOwnerId, "owner");
});

test("必須の環境変数が欠けていればまとめて報告する", () => {
  assert.throws(
    () => loadConfig({ HATENA_ID: "member" }),
    /HATENA_BLOG_ID, HATENA_API_KEY/,
  );
});
