import { z } from "zod";
import { isoDateSchema } from "../expenses/expense.schemas.js";
export const createSettlementRecordSchema = z.object({
  recipientUserId: z.string().uuid(),
  amount: z.string(),
  occurredOn: isoDateSchema,
  groupId: z.string().uuid().optional(),
  note: z.string().trim().min(1).max(280).optional(),
}).strict();
export type CreateSettlementRecordInput = z.infer<typeof createSettlementRecordSchema>;
