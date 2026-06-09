import { z } from "zod";

export const API_PREFIX = "/api/v1";

export type ServiceStatus = {
  name: string;
  status: "ok";
};

export const uuidSchema = z.uuid();
export const correlationIdSchema = z.string().min(1).max(128);

export const apiErrorSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({}),
  correlationId: correlationIdSchema
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const cursorPageSchema = z.object({
  cursor: z.string().nullable(),
  nextCursor: z.string().nullable(),
  limit: z.number().int().min(1).max(100)
});

export function paginatedResponseSchema<T extends z.ZodType>(
  itemSchema: T
): z.ZodObject<{
  data: z.ZodArray<T>;
  page: typeof cursorPageSchema;
}> {
  return z.object({
    data: z.array(itemSchema),
    page: cursorPageSchema
  });
}
