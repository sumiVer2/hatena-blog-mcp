/** はてなブログが受け付ける本文の記法。実際の解釈はブログ側の「編集モード」設定に従う。 */
export type ContentType =
  | "text/x-markdown"
  | "text/x-hatena-syntax"
  | "text/html"
  | "text/plain";

/** 記事・固定ページのどちらのコレクションを扱うか */
export type CollectionKind = "entry" | "page";

export interface HatenaEntry {
  /** AtomPub 上の一意な ID（tag: 形式） */
  id: string;
  /** 編集 URI 末尾の ID。get/update で指定する値 */
  entryId: string;
  title: string;
  /** 公開ページの URL。下書きの場合は公開後の想定 URL */
  url: string | null;
  editUrl: string | null;
  /** 下書きプレビュー共有 URL（app:preview が yes のときのみ） */
  previewUrl: string | null;
  author: string | null;
  published: string | null;
  updated: string | null;
  /** 最終編集日時（app:edited） */
  edited: string | null;
  draft: boolean;
  /** 下書きプレビューの共有が有効か */
  previewShared: boolean;
  categories: string[];
  contentType: string | null;
  content: string;
  summary: string | null;
  /** HTML に変換済みの本文（要求時のみ含む） */
  formattedContent?: string;
}

export interface EntryList {
  entries: HatenaEntry[];
  /** 次ページを取得するための page パラメータ。null なら最終ページ */
  nextPage: string | null;
}

/** 記事の新規作成・更新で指定できる項目 */
export interface EntryInput {
  title: string;
  content: string;
  contentType?: ContentType;
  /** 投稿日時（ISO 8601）。記事の表示日時になる */
  updated: string;
  author?: string;
  categories?: string[];
  draft?: boolean;
  /** 下書きのプレビュー共有 URL を発行するか */
  previewShared?: boolean;
  /** 予約投稿。draft=true かつ updated が未来日時のときに有効 */
  scheduled?: boolean;
  /** カスタム URL（記事 URL のスラッグ部分） */
  customUrl?: string;
}

export interface BlogInfo {
  title: string;
  collections: Array<{ title: string; href: string; accept: string | null }>;
}

/** はてなフォトライフへの画像アップロードで指定する項目 */
export interface UploadImageInput {
  title: string;
  data: Buffer;
  contentType: string;
  /** 保存先のフォルダ名。存在しなければフォトライフ側で作られる */
  folder: string;
}

export interface UploadedImage {
  /** フォトライフが返すはてな記法（例: f:id:user:20261017120000p:image） */
  syntax: string;
  /** 記事本文にそのまま貼れる形（例: [f:id:user:20261017120000p:plain]） */
  embed: string;
  imageUrl: string | null;
  imageUrlSmall: string | null;
  /** フォトライフ上の画像ページ */
  pageUrl: string | null;
  editUrl: string | null;
}
