import type { SupportedDocumentMimeType } from "@devhub/contracts";
import { normalizeText } from "@devhub/rag";

export interface ParsedDocument {
  text: string;
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: SupportedDocumentMimeType
): Promise<ParsedDocument> {
  if (mimeType === "application/pdf") {
    return parsePdf(buffer);
  }
  return { text: normalizeText(buffer.toString("utf8")) };
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const parsed = await parser.getText();
    return { text: normalizeText(parsed.text) };
  } finally {
    await parser.destroy();
  }
}
