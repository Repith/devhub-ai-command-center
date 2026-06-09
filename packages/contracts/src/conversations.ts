import { z } from "zod";

import { uuidSchema } from "./api.js";

export const messageRoleSchema = z.enum(["USER", "ASSISTANT"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const conversationMessageSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  role: messageRoleSchema,
  content: z.string(),
  sequence: z.number().int().nonnegative(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime()
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationSchema = z.object({
  id: uuidSchema,
  agentId: uuidSchema.nullable(),
  title: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationListSchema = z.object({
  data: z.array(conversationSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type ConversationList = z.infer<typeof conversationListSchema>;

export const conversationMessageListSchema = z.object({
  data: z.array(conversationMessageSchema),
  page: z.object({
    cursor: z.null(),
    nextCursor: z.null(),
    limit: z.number().int().min(1).max(100)
  })
});
export type ConversationMessageList = z.infer<
  typeof conversationMessageListSchema
>;

export const createChatMessageSchema = z
  .object({
    conversationId: uuidSchema.optional(),
    message: z.string().trim().min(1).max(50_000)
  })
  .strict();
export type CreateChatMessage = z.infer<typeof createChatMessageSchema>;

export const chatUsageSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative()
});
export type ChatUsage = z.infer<typeof chatUsageSchema>;

const chatStreamEventBaseSchema = z.object({
  version: z.literal(1)
});

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  chatStreamEventBaseSchema.extend({
    type: z.literal("chat.started"),
    conversationId: uuidSchema,
    userMessage: conversationMessageSchema
  }),
  chatStreamEventBaseSchema.extend({
    type: z.literal("chat.delta"),
    text: z.string().min(1)
  }),
  chatStreamEventBaseSchema.extend({
    type: z.literal("chat.completed"),
    assistantMessage: conversationMessageSchema,
    usage: chatUsageSchema
  }),
  chatStreamEventBaseSchema.extend({
    type: z.literal("chat.error"),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
