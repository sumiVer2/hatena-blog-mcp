import { createHash, randomBytes } from "node:crypto";

/**
 * WSSE UsernameToken を生成する。
 * PasswordDigest = Base64(SHA1(Nonce + Created + APIキー))
 * Nonce はダイジェスト計算では生バイト列、ヘッダでは Base64 で扱う。
 */
export function buildWsseHeader(username: string, apiKey: string): string {
  const nonce = randomBytes(20);
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const digest = createHash("sha1")
    .update(nonce)
    .update(created, "utf8")
    .update(apiKey, "utf8")
    .digest("base64");

  return [
    `UsernameToken Username="${username}"`,
    `PasswordDigest="${digest}"`,
    `Nonce="${nonce.toString("base64")}"`,
    `Created="${created}"`,
  ].join(", ");
}
