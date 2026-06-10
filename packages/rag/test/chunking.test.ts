import { describe, expect, it } from "vitest";

import { chunkText, normalizeText } from "../src";

describe("document chunking", () => {
  it("normalizes whitespace without dropping text", () => {
    expect(normalizeText("Title\r\n\r\n\r\nBody   \n")).toBe("Title\n\nBody");
  });

  it("chunks text with deterministic overlap", () => {
    const text = Array.from({ length: 12 }, (_, index) => `w${index}`).join(
      " "
    );

    expect(chunkText(text, { targetTokens: 5, overlapTokens: 2 })).toEqual([
      {
        ordinal: 0,
        content: "w0 w1 w2 w3 w4",
        tokenCount: 5,
        pageNumber: null
      },
      {
        ordinal: 1,
        content: "w3 w4 w5 w6 w7",
        tokenCount: 5,
        pageNumber: null
      },
      {
        ordinal: 2,
        content: "w6 w7 w8 w9 w10",
        tokenCount: 5,
        pageNumber: null
      },
      {
        ordinal: 3,
        content: "w9 w10 w11",
        tokenCount: 3,
        pageNumber: null
      }
    ]);
  });
});
