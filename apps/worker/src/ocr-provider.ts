import { z } from "zod";

const ocrResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().default("")
        })
      })
    )
    .default([])
});

const providerErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional()
    })
    .passthrough()
});

export interface OcrInput {
  image: Buffer | Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface OcrProvider {
  readonly name: string;
  extractText(input: OcrInput): Promise<string>;
}

export interface OllamaVisionOcrProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  model: string;
  timeoutMs: number;
}

export class OllamaVisionOcrProvider implements OcrProvider {
  public readonly name = "ollama-vision-ocr";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: OllamaVisionOcrProviderOptions) {
    this.apiKey = options.apiKey ?? "ollama";
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434/v1").replace(
      /\/+$/,
      ""
    );
    this.model = options.model;
    this.request = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  public async extractText(input: OcrInput): Promise<string> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.request(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all readable text from this image. Preserve headings, bullet lists, tables as plain Markdown where possible. Return only the extracted text, with no commentary."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: toDataUrl(input.image, input.mimeType)
                  }
                }
              ]
            }
          ],
          stream: false,
          temperature: 0
        }),
        signal: timeoutSignal
      });
    } catch (error) {
      throw new Error(`OCR provider is unavailable: ${errorMessage(error)}`, {
        cause: error
      });
    }

    if (!response.ok) {
      throw new Error(
        `OCR provider returned HTTP ${response.status}: ${await readError(response)}`
      );
    }

    const parsed = ocrResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("OCR provider returned an invalid response.");
    }
    return parsed.data.choices
      .map((choice) => choice.message.content)
      .join("\n\n")
      .trim();
  }
}

function toDataUrl(
  image: Buffer | Uint8Array,
  mimeType: OcrInput["mimeType"]
): string {
  return `data:${mimeType};base64,${Buffer.from(image).toString("base64")}`;
}

async function readError(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = providerErrorSchema.safeParse(JSON.parse(body) as unknown);
    return parsed.success
      ? (parsed.data.error.message ?? "Unknown provider error.")
      : body.slice(0, 500) || "Unknown provider error.";
  } catch {
    return body.slice(0, 500) || "Unknown provider error.";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
