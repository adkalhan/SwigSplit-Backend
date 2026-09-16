ALTER TABLE "invites" RENAME TO "group_invites";
ALTER INDEX "invites_pkey" RENAME TO "group_invites_pkey";
ALTER INDEX "invites_token_hash_key" RENAME TO "group_invites_token_hash_key";
DROP INDEX "invites_group_phone_status_idx";

-- Recipient-bound links were never issued by the API. Cancel any legacy pending
-- rows so a record created under the old recipient-bound behavior cannot be
-- redeemed as a new bearer link.
UPDATE "group_invites" SET "status" = 'CANCELLED' WHERE "status" = 'PENDING';

ALTER TABLE "group_invites"
DROP COLUMN "phone_e164",
DROP COLUMN "invited_by_user_id";

CREATE INDEX "group_invites_group_id_status_idx" ON "group_invites"("group_id", "status");

CREATE TABLE "app_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_invites_token_hash_key" ON "app_invites"("token_hash");
CREATE INDEX "app_invites_status_expires_at_idx" ON "app_invites"("status", "expires_at");
