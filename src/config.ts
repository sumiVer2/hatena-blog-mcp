export interface HatenaConfig {
  /** はてなID */
  hatenaId: string;
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

  return {
    hatenaId: env.HATENA_ID!.trim(),
    blogId: env.HATENA_BLOG_ID!.trim(),
    apiKey: env.HATENA_API_KEY!.trim(),
  };
}
