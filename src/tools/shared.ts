import type { HatenaEntry } from "../hatena/types.js";

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

/** ツール本体を実行し、例外を MCP のエラー結果に変換する */
export async function respond(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await fn());
  } catch (error) {
    return errorResult(error);
  }
}

/** ローカルタイムゾーンのオフセット付き ISO 8601 文字列を返す */
export function isoWithLocalOffset(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** 一覧・検索結果として返す軽量な表現。本文は要求されたときだけ含める */
export function summarize(entry: HatenaEntry, includeContent: boolean) {
  const { content, formattedContent, summary, ...rest } = entry;
  return includeContent ? { ...rest, content } : { ...rest, summary };
}
