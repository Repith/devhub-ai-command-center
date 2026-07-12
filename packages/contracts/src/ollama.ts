import { z } from "zod";

export const ollamaRuntimeStatusSchema = z
  .object({
    available: z.boolean(),
    baseUrl: z.url(),
    configuredModel: z.string().min(1),
    configuredModelAvailable: z.boolean(),
    models: z.array(z.string().min(1)),
    errorCode: z.string().nullable()
  })
  .strict();

export type OllamaRuntimeStatus = z.infer<typeof ollamaRuntimeStatusSchema>;
