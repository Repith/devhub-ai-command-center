import type { SupportedDocumentMimeType } from "@devhub/contracts";
import { normalizeText } from "@devhub/rag";

import type { OcrProvider } from "./ocr-provider.js";

export interface ParsedDocument {
  text: string;
  strategy: DocumentExtractionStrategy;
}

export type DocumentExtractionStrategy =
  | "native-text"
  | "pdf-native-text"
  | "pdf-ocr"
  | "image-ocr";

export interface DocumentParserOptions {
  ocrMaxPdfPages: number;
  ocrProvider?: OcrProvider;
  ocrTextMinCharacters: number;
  ocrTextMinWords: number;
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: SupportedDocumentMimeType,
  options: DocumentParserOptions
): Promise<ParsedDocument> {
  if (mimeType === "application/pdf") {
    return parsePdf(buffer, options);
  }
  if (isImageMimeType(mimeType)) {
    if (!options.ocrProvider) {
      throw new Error(
        "OCR is required for image uploads but is not configured."
      );
    }
    const text = normalizeText(
      await options.ocrProvider.extractText({ image: buffer, mimeType })
    );
    return { text, strategy: "image-ocr" };
  }
  return {
    text: normalizeText(buffer.toString("utf8")),
    strategy: "native-text"
  };
}

export function selectExtractionStrategy(
  mimeType: SupportedDocumentMimeType,
  extractedText: string,
  options: Pick<
    DocumentParserOptions,
    "ocrTextMinCharacters" | "ocrTextMinWords"
  >
): DocumentExtractionStrategy {
  if (isImageMimeType(mimeType)) {
    return "image-ocr";
  }
  if (mimeType !== "application/pdf") {
    return "native-text";
  }
  return hasEnoughExtractedText(extractedText, options)
    ? "pdf-native-text"
    : "pdf-ocr";
}

async function parsePdf(
  buffer: Buffer,
  options: DocumentParserOptions
): Promise<ParsedDocument> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const parsed = await parser.getText();
    const text = normalizeText(parsed.text);
    const strategy = selectExtractionStrategy("application/pdf", text, options);
    if (strategy === "pdf-native-text") {
      return { text, strategy };
    }
    if (!options.ocrProvider) {
      throw new Error(
        "PDF appears to be scanned or image-only, but OCR is not configured."
      );
    }
    const screenshots = await parser.getScreenshot({
      desiredWidth: 1400,
      first: options.ocrMaxPdfPages,
      imageBuffer: true,
      imageDataUrl: false
    });
    const pageTexts: string[] = [];
    for (const page of screenshots.pages) {
      const pageText = normalizeText(
        await options.ocrProvider.extractText({
          image: page.data,
          mimeType: "image/png"
        })
      );
      if (pageText) {
        pageTexts.push(`Page ${page.pageNumber}\n${pageText}`);
      }
    }
    return { text: normalizeText(pageTexts.join("\n\n")), strategy };
  } finally {
    await parser.destroy();
  }
}

function hasEnoughExtractedText(
  text: string,
  options: Pick<
    DocumentParserOptions,
    "ocrTextMinCharacters" | "ocrTextMinWords"
  >
): boolean {
  const normalized = normalizeText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return (
    normalized.length >= options.ocrTextMinCharacters &&
    wordCount >= options.ocrTextMinWords
  );
}

function isImageMimeType(
  mimeType: SupportedDocumentMimeType
): mimeType is "image/jpeg" | "image/png" | "image/webp" {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}
