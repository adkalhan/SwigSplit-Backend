CREATE TYPE "DraftCartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT');

CREATE TABLE "activity_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "group_id" UUID,
  "event_type" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "group_id" UUID,
  "event_type" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(6),
  "processed_at" TIMESTAMPTZ(6),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "group_id" UUID,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "list_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "list_id" UUID NOT NULL,
  "product_name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "list_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "list_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "draft_carts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "status" "DraftCartStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "draft_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "draft_cart_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "draft_cart_id" UUID NOT NULL,
  "product_name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "draft_cart_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "draft_cart_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE INDEX "activity_events_user_id_created_at_id_idx"
  ON "activity_events" ("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "notifications_user_id_read_at_created_at_idx"
  ON "notifications" ("user_id", "read_at", "created_at" DESC);
CREATE INDEX "outbox_events_processed_at_available_at_idx"
  ON "outbox_events" ("processed_at", "available_at");
CREATE INDEX "lists_group_id_updated_at_idx"
  ON "lists" ("group_id", "updated_at" DESC);
CREATE INDEX "lists_owner_user_id_group_id_updated_at_idx"
  ON "lists" ("owner_user_id", "group_id", "updated_at" DESC);
CREATE INDEX "list_items_list_id_created_at_idx"
  ON "list_items" ("list_id", "created_at");
CREATE INDEX "draft_cart_items_draft_cart_id_created_at_idx"
  ON "draft_cart_items" ("draft_cart_id", "created_at");
CREATE UNIQUE INDEX "draft_carts_one_active_per_owner_group"
  ON "draft_carts" ("owner_user_id", "group_id")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "activity_events"
  ADD CONSTRAINT "activity_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "activity_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "activity_events_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "notifications_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lists"
  ADD CONSTRAINT "lists_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "lists_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "list_items"
  ADD CONSTRAINT "list_items_list_id_fkey"
  FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_carts"
  ADD CONSTRAINT "draft_carts_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "draft_carts_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_cart_items"
  ADD CONSTRAINT "draft_cart_items_draft_cart_id_fkey"
  FOREIGN KEY ("draft_cart_id") REFERENCES "draft_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
