CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'DELETED');
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL');
CREATE TYPE "ExpenseRevisionEvent" AS ENUM ('CREATED', 'UPDATED', 'DELETED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "expenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "group_id" UUID, "title" TEXT NOT NULL,
  "amount_paise" BIGINT NOT NULL, "occurred_on" DATE NOT NULL, "payer_user_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL, "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
  "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE', "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expenses_amount_paise_positive" CHECK ("amount_paise" > 0 AND "amount_paise" <= 10000000)
);
CREATE TABLE "expense_participants" (
  "expense_id" UUID NOT NULL, "user_id" UUID NOT NULL, "share_paise" BIGINT NOT NULL,
  CONSTRAINT "expense_participants_pkey" PRIMARY KEY ("expense_id", "user_id"),
  CONSTRAINT "expense_participants_share_paise_positive" CHECK ("share_paise" > 0)
);
CREATE TABLE "expense_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "expense_id" UUID NOT NULL, "version" INTEGER NOT NULL,
  "event" "ExpenseRevisionEvent" NOT NULL, "changed_by_user_id" UUID NOT NULL,
  "before_snapshot" JSONB, "after_snapshot" JSONB NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_revisions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "settlement_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "group_id" UUID, "sender_user_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL, "created_by_user_id" UUID NOT NULL, "amount_paise" BIGINT NOT NULL,
  "occurred_on" DATE NOT NULL, "note" TEXT, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_records_amount_paise_positive" CHECK ("amount_paise" > 0 AND "amount_paise" <= 10000000),
  CONSTRAINT "settlement_records_distinct_parties" CHECK ("sender_user_id" <> "recipient_user_id")
);
CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL, "status" "IdempotencyStatus" NOT NULL DEFAULT 'PENDING',
  "response_status" INTEGER, "response_body" JSONB, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "completed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "expense_revisions_expense_id_version_key" ON "expense_revisions"("expense_id", "version");
CREATE UNIQUE INDEX "idempotency_records_user_id_key_key" ON "idempotency_records"("user_id", "key");
CREATE INDEX "expenses_group_id_status_occurred_on_idx" ON "expenses"("group_id", "status", "occurred_on");
CREATE INDEX "expenses_payer_user_id_status_idx" ON "expenses"("payer_user_id", "status");
CREATE INDEX "expense_participants_user_id_expense_id_idx" ON "expense_participants"("user_id", "expense_id");
CREATE INDEX "settlement_records_sender_user_id_occurred_on_idx" ON "settlement_records"("sender_user_id", "occurred_on");
CREATE INDEX "settlement_records_recipient_user_id_occurred_on_idx" ON "settlement_records"("recipient_user_id", "occurred_on");
CREATE INDEX "settlement_records_group_id_occurred_on_idx" ON "settlement_records"("group_id", "occurred_on");
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_user_id_fkey" FOREIGN KEY ("payer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_participants" ADD CONSTRAINT "expense_participants_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_participants" ADD CONSTRAINT "expense_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_revisions" ADD CONSTRAINT "expense_revisions_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
