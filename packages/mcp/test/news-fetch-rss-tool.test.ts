import { describe, expect, it } from "vitest";

import { createNewsFetchRssTool } from "../src";

const context = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  correlationId: "rss-test"
};

describe("news.fetch_rss", () => {
  it("parses RSS items with an output limit", async () => {
    const tool = createNewsFetchRssTool({
      lookup: () => Promise.resolve(["93.184.216.34"]),
      fetch: (() =>
        Promise.resolve(
          new Response(`
            <rss><channel>
              <item><title>One</title><link>https://example.com/one</link><description>A</description></item>
              <item><title>Two</title><link>https://example.com/two</link><description>B</description></item>
            </channel></rss>
          `)
        )) as typeof fetch
    });

    await expect(
      tool.execute({ url: "https://example.com/feed.xml", limit: 1 }, context)
    ).resolves.toEqual({
      sourceUrl: "https://example.com/feed.xml",
      items: [
        {
          title: "One",
          url: "https://example.com/one",
          publishedAt: null,
          summary: "A"
        }
      ]
    });
  });

  it("rejects private network targets", async () => {
    const tool = createNewsFetchRssTool();

    await expect(
      tool.execute({ url: "http://127.0.0.1/feed.xml", limit: 1 }, context)
    ).rejects.toThrow(/private network/i);
  });

  it("rejects non-http URLs", async () => {
    const tool = createNewsFetchRssTool();

    await expect(
      tool.execute({ url: "file:///etc/passwd", limit: 1 }, context)
    ).rejects.toThrow(/http/i);
  });
});
