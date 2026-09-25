import { z } from "zod";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "occurredOn must be YYYY-MM-DD");

export const participantShareSchema = z.object({
  userId: z.string().uuid(),
  share: z.string(),
}).strict();
export const createExpenseSchema = z.object({
  title: z.string().trim().min(1).max(140),
  amount: z.string(),
  occurredOn: isoDateSchema,
  payerUserId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
  participants: z.array(participantShareSchema).min(1),
}).strict();
export const updateExpenseSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(140).optional(),
  amount: z.string().optional(),
  occurredOn: isoDateSchema.optional(),
  payerUserId: z.string().uuid().optional(),
  groupId: z.string().uuid().nullable().optional(),
  participants: z.array(participantShareSchema).min(1).optional(),
}).strict();
export const deleteExpenseSchema = z.object({ version: z.number().int().positive() }).strict();
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
