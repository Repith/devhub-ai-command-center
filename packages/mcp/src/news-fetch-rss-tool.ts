import { XMLParser } from "fast-xml-parser";
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

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
  lookup?: (hostname: string) => Promise<readonly string[]>;
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
  const request = options.fetch ?? fetch;
  const response = await safeFetch(input.url, request, options);
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

async function safeFetch(
  value: string,
  request: typeof fetch,
  options: NewsFetchRssToolOptions
): Promise<Response> {
  let url = new URL(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertSafeHttpUrl(url, options.lookup ?? resolveAddresses);
    const response = await request(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location || redirect === 3) {
      throw new Error("RSS redirect limit exceeded.");
    }
    url = new URL(location, url);
  }
  throw new Error("RSS redirect limit exceeded.");
}

async function assertSafeHttpUrl(
  url: URL,
  lookup: (hostname: string) => Promise<readonly string[]>
): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("RSS URL must use http or https.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("RSS URL cannot target a private network.");
  }
  const addresses = isIP(hostname) ? [hostname] : await lookup(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("RSS URL cannot target a private network.");
  }
}

async function resolveAddresses(hostname: string): Promise<readonly string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.includes(":")) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }
  const octets = normalized.split(".").map(Number);
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] ?? 0) >= 224
  );
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
