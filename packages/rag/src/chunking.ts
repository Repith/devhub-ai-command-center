export interface TextChunk {
  ordinal: number;
  content: string;
  tokenCount: number;
  pageNumber?: number | null;
}

export interface ChunkTextOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

const defaultTargetTokens = 25;
const defaultOverlapTokens = 5;

export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(
  input: string,
  options: ChunkTextOptions = {}
): TextChunk[] {
  const normalized = normalizeText(input);
  if (!normalized) {
    return [];
  }

  const targetTokens = options.targetTokens ?? defaultTargetTokens;
  const overlapTokens = options.overlapTokens ?? defaultOverlapTokens;
  const words = normalized.split(/\s+/).filter(Boolean);
  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + targetTokens, words.length);
    const content = words.slice(start, end).join(" ");
    chunks.push({
      ordinal: chunks.length,
      content,
      tokenCount: end - start,
      pageNumber: null
    });
    if (end === words.length) {
      break;
    }
    start = Math.max(end - overlapTokens, start + 1);
  }

  return chunks;
}
