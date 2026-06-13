import { describe, expect, it } from "vitest";

import {
  parseDocument,
  selectExtractionStrategy
} from "../src/document-parser";

describe("document parser strategy selection", () => {
  const strategyOptions = {
    ocrTextMinCharacters: 120,
    ocrTextMinWords: 20
  };

  it("uses native extraction for text documents", () => {
    expect(
      selectExtractionStrategy("text/plain", "short text", strategyOptions)
    ).toBe("native-text");
  });

  it("keeps text-rich PDFs on native PDF extraction", () => {
    const text = Array.from({ length: 25 }, (_, index) => `word${index}`).join(
      " "
    );

    expect(
      selectExtractionStrategy("application/pdf", text, strategyOptions)
    ).toBe("pdf-native-text");
  });

  it("routes text-poor PDFs to OCR", () => {
    expect(
      selectExtractionStrategy("application/pdf", "Scanned", strategyOptions)
    ).toBe("pdf-ocr");
  });

  it("routes image uploads to OCR", () => {
    expect(selectExtractionStrategy("image/png", "", strategyOptions)).toBe(
      "image-ocr"
    );
  });

  it("extracts image text through the OCR provider", async () => {
    const parsed = await parseDocument(Buffer.from("fake-png"), "image/png", {
      ocrMaxPdfPages: 8,
      ocrProvider: {
        name: "fake",
        extractText: () => Promise.resolve("Name\nRole\nSkills")
      },
      ocrTextMinCharacters: 120,
      ocrTextMinWords: 20
    });

    expect(parsed).toEqual({
      strategy: "image-ocr",
      text: "Name\nRole\nSkills"
    });
  });
});
