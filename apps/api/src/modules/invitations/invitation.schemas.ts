import { z } from "zod";

export const inviteTokenSchema = z.string().min(32).max(256);
export const redeemInviteSchema = z.object({ inviteToken: inviteTokenSchema });
