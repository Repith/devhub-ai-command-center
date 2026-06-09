import { z } from "zod";

import { membershipRoleSchema } from "./statuses.js";

const emailSchema = z.email().trim().toLowerCase().max(320);
const passwordSchema = z.string().min(12).max(200);
const tenantSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(120).optional(),
    tenantName: z.string().trim().min(1).max(120),
    tenantSlug: tenantSlugSchema.optional()
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    tenantSlug: tenantSlugSchema.optional()
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const accessTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive()
});
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

export const authenticatedUserSchema = z.object({
  userId: z.uuid(),
  email: emailSchema,
  displayName: z.string().nullable(),
  tenantId: z.uuid(),
  tenantName: z.string(),
  tenantSlug: tenantSlugSchema,
  role: membershipRoleSchema
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
