import { XMLParser } from "fast-xml-parser";

import {
  newsFetchRssInputSchema,
  newsFetchRssOutputSchema,
  type NewsFetchRssInput,
  type NewsFetchRssOutput,
  type RssItem
} from "@devhub/contracts";

import type { ToolDefinition } from "./tool-registry.js";

const maxRssBytes = 512 * 1024;

export interface NewsFetchRssToolOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createNewsFetchRssTool(
  options: NewsFetchRssToolOptions = {}
): ToolDefinition<NewsFetchRssInput, NewsFetchRssOutput> {
  return {
    id: "news.fetch_rss",
    description: "Fetch and parse a bounded RSS or Atom feed.",
    inputSchema: newsFetchRssInputSchema,
    outputSchema: newsFetchRssOutputSchema,
    execute: (input) => fetchRss(options, input)
  };
}

async function fetchRss(
  options: NewsFetchRssToolOptions,
  input: NewsFetchRssInput
): Promise<NewsFetchRssOutput> {
  assertHttpUrl(input.url);
  const request = options.fetch ?? fetch;
  const response = await request(input.url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000)
  });
  if (!response.ok) {
    throw new Error(`RSS fetch failed with HTTP ${response.status}.`);
  }
  const text = await readBoundedText(response);
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text"
  }).parse(text) as unknown;

  return {
    sourceUrl: input.url,
    items: extractItems(parsed).slice(0, input.limit)
  };
}

function assertHttpUrl(value: string): void {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("RSS URL must use http or https.");
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxRssBytes) {
    throw new Error("RSS response exceeded the maximum allowed size.");
  }
  return text;
}

function extractItems(value: unknown): RssItem[] {
  const root = value as Record<string, unknown>;
  const rssItems = selectArray(
    selectRecord(selectRecord(root.rss)?.channel)?.item
  );
  const atomItems = selectArray(selectRecord(root.feed)?.entry);
  return [...rssItems.map(toRssItem), ...atomItems.map(toAtomItem)].filter(
    (item) => item.title || item.summary || item.url
  );
}

function toRssItem(value: unknown): RssItem {
  const item = selectRecord(value);
  return {
    title: text(item?.title),
    url: nullableText(item?.link),
    publishedAt: nullableText(item?.pubDate),
    summary: text(item?.description)
  };
}

function toAtomItem(value: unknown): RssItem {
  const item = selectRecord(value);
  return {
    title: text(item?.title),
    url: atomLink(item?.link),
    publishedAt: nullableText(item?.updated ?? item?.published),
    summary: text(item?.summary ?? item?.content)
  };
}

function selectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function selectArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

function text(value: unknown): string {
  const raw = nullableText(value);
  return raw ?? "";
}

function nullableText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const record = selectRecord(value);
  const nodeText = record?.["#text"];
  return typeof nodeText === "string" ? nodeText : null;
}

function atomLink(value: unknown): string | null {
  const link = Array.isArray(value) ? value[0] : value;
  const record = selectRecord(link);
  return nullableText(record?.["@_href"] ?? link);
}
