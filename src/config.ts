export interface HatenaConfig {
  /** 認証に使うアカウントのはてなID（API キーの持ち主） */
  hatenaId: string;
  /**
   * ルートエンドポイントのはてなID部分。ブログの所有者を指す。
   * 共有ブログでは操作者（hatenaId）と一致しないため、認証用とは別に持つ。
   */
  blogOwnerId: string;
  /** ブログID（例: tech.example.hatenablog.com） */
  blogId: string;
  /** AtomPub の API キー */
  apiKey: string;
}

const REQUIRED_ENV = ["HATENA_ID", "HATENA_BLOG_ID", "HATENA_API_KEY"] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HatenaConfig {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `環境変数が設定されていません: ${missing.join(", ")}\n` +
        `API キーは はてなブログの [設定] > [詳細設定] > [AtomPub] から取得できます。`,
    );
  }

  const hatenaId = env.HATENA_ID!.trim();

  return {
    hatenaId,
    // 自分が所有するブログでは所有者と操作者が同じなので、省略できるようにする
    blogOwnerId: env.HATENA_BLOG_OWNER_ID?.trim() || hatenaId,
    blogId: env.HATENA_BLOG_ID!.trim(),
    apiKey: env.HATENA_API_KEY!.trim(),
  };
}
