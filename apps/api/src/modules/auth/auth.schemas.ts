import { z } from "zod";

export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "phone must be E.164");

export const registerSchema = z.object({
  phone: phoneSchema,
  inviteToken: z.string().min(32).optional(),
});

export const refreshSessionSchema = z.object({ refreshToken: z.string().min(32) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
