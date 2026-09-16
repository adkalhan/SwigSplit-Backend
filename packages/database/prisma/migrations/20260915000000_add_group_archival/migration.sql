ALTER TABLE "groups"
ADD COLUMN "archived_at" TIMESTAMPTZ(6),
ADD COLUMN "purge_after" TIMESTAMPTZ(6);

CREATE INDEX "groups_purge_after_idx" ON "groups"("purge_after");
