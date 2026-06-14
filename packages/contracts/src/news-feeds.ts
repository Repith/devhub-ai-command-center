import { z } from "zod";

import { uuidSchema } from "./api.js";

export const newsFeedFetchStatusSchema = z.enum([
  "NEVER",
  "COMPLETED",
  "FAILED"
]);
export type NewsFeedFetchStatus = z.infer<typeof newsFeedFetchStatusSchema>;

export const newsFeedSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(120),
    url: z.url(),
    topic: z.string().max(120).nullable(),
    enabled: z.boolean(),
    lastFetchedAt: z.iso.datetime().nullable(),
    lastFetchStatus: newsFeedFetchStatusSchema,
    lastFetchItemCount: z.number().int().nonnegative().nullable(),
    lastFetchErrorCode: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
  })
  .strict();
export type NewsFeed = z.infer<typeof newsFeedSchema>;

export const newsFeedListSchema = z
  .object({
    data: z.array(newsFeedSchema),
    page: z.object({
      cursor: z.null(),
      nextCursor: z.null(),
      limit: z.number().int().min(1).max(100)
    })
  })
  .strict();
export type NewsFeedList = z.infer<typeof newsFeedListSchema>;

export const createNewsFeedSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    url: z.url(),
    topic: z.string().trim().max(120).nullable().optional(),
    enabled: z.boolean().default(true)
  })
  .strict();
export type CreateNewsFeed = z.infer<typeof createNewsFeedSchema>;

export const updateNewsFeedSchema = createNewsFeedSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateNewsFeed = z.infer<typeof updateNewsFeedSchema>;
