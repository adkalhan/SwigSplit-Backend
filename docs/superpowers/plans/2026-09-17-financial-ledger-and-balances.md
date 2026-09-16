# Financial Ledger and Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `MoneyModule` financial source of truth for immediate direct/group expenses, settlement records, idempotent mutations, immutable expense history, and derived balances.

**Architecture:** `AppModule` imports one `MoneyModule`, which composes focused expense, settlement-record, balance, and shared-money modules. PostgreSQL holds current ledger facts and immutable revisions; balances are read-only SQL projections from active exact shares and settlement records. No friendship/contact, Activity, notification, outbox, OTP, or smart-debt subsystem is added.

**Tech Stack:** TypeScript, NestJS 11, Fastify 5, PostgreSQL 16, Prisma 6, Zod 3, Node.js `crypto`.

**Spec:** `docs/superpowers/specs/2026-09-17-financial-ledger-design.md`

## Global Constraints

- Treat a registered user as eligible during the private beta even when `phoneVerifiedAt` is null; OTP enforcement comes later.
- Support direct expenses (`groupId` absent) and group expenses (`groupId` present) with immediate effect; there is no participant acceptance state.
- Accept canonical decimal rupee strings only; parse and format paise without JavaScript floating point.
- Every expense and settlement-record amount must be at least ₹0.01 and at most ₹100,000.00.
- Persist money only in PostgreSQL `BIGINT` paise columns and return money as exact decimal strings.
- Expense participant user IDs are unique and exact shares must equal the expense amount exactly.
- Financial mutations require a UUID `Idempotency-Key`, use serializable transactions, and never create a mutable balance row.
- Expense edits and deletion require the client’s current version; stale versions return `409` with the latest expense body.
- Use `GroupMembershipService.requireActiveMember` for group authorization; do not duplicate membership queries in money modules.
- Preserve the global error response shape `{ statusCode, error, message, requestId }`.
- Do not add, run, or describe automated testing in this Task 3 implementation scope. Do not run build commands; the user runs builds.

---

## Planned file structure

```text
apps/api/src/
  app.module.ts                                      # imports MoneyModule
  modules/money/
    money.module.ts                                  # one public financial boundary
    shared/
      money-shared.module.ts                         # private providers shared by money features
      money.service.ts                               # decimal/paise conversion and share validation
      idempotency.service.ts                         # UUID key claim, replay, and response persistence
    expenses/
      expenses.module.ts
      expenses.controller.ts
      expenses.service.ts
      expense-revision.service.ts
      expense.schemas.ts
      expense.dto.ts
    settlement-records/
      settlement-records.module.ts
      settlement-records.controller.ts
      settlement-records.service.ts
      settlement-record.schemas.ts
      settlement-record.dto.ts
    balances/
      balances.module.ts
      balances.controller.ts
      balances.service.ts
      balance.dto.ts
packages/database/prisma/
  schema.prisma                                      # finance models and enum relations
  migrations/<timestamp>_financial_ledger/migration.sql
```

Delete the now-unused placeholder directories `apps/api/src/modules/{expenses,payments,balances}` only after their `.gitkeep` files are no longer needed. Do not create a separate top-level `payments` module; the persisted and API name is `settlement_records`.

## Task 1: Create the financial persistence model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_financial_ledger/migration.sql`

**Interfaces:**
- Consumes: existing `User`, `Group`, `GroupMember`, `PrismaService`, UUID defaults, and the `pgcrypto` extension established by prior migrations.
- Produces: Prisma delegates `expense`, `expenseParticipant`, `expenseRevision`, `settlementRecord`, and `idempotencyRecord`; enums `ExpenseStatus`, `ExpenseSource`, `ExpenseRevisionEvent`, and `IdempotencyStatus`.

- [ ] **Step 1: Add financial enums and model relations to the Prisma schema**

  Add the enum types and user/group relations. Use PascalCase Prisma model names and snake-case mapped table/column names, matching the existing schema.

  ```prisma
  enum ExpenseStatus { ACTIVE DELETED }
  enum ExpenseSource { MANUAL }
  enum ExpenseRevisionEvent { CREATED UPDATED DELETED }
  enum IdempotencyStatus { PENDING COMPLETED }

  model User {
    // existing fields
    paidExpenses          Expense[]          @relation("ExpensePayer")
    createdExpenses       Expense[]          @relation("ExpenseCreator")
    expenseParticipations ExpenseParticipant[]
    changedExpenseRevisions ExpenseRevision[] @relation("ExpenseRevisionActor")
    sentSettlements       SettlementRecord[] @relation("SettlementSender")
    receivedSettlements   SettlementRecord[] @relation("SettlementRecipient")
    createdSettlements    SettlementRecord[] @relation("SettlementCreator")
    idempotencyRecords    IdempotencyRecord[]
  }

  model Group {
    // existing fields
    expenses          Expense[]
    settlementRecords SettlementRecord[]
  }
  ```

- [ ] **Step 2: Define the five financial models with database-enforced identity and lookup constraints**

  Use `BigInt @db.BigInt` for paise and `DateTime @db.Date` for `occurredOn`. Make `groupId` nullable for direct records, and preserve all ledger records with `onDelete: Restrict` user/group relations.

  ```prisma
  model Expense {
    id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    groupId         String?       @map("group_id") @db.Uuid
    title           String
    amountPaise     BigInt        @map("amount_paise") @db.BigInt
    occurredOn      DateTime      @map("occurred_on") @db.Date
    payerUserId     String        @map("payer_user_id") @db.Uuid
    createdByUserId String        @map("created_by_user_id") @db.Uuid
    source          ExpenseSource @default(MANUAL)
    status          ExpenseStatus @default(ACTIVE)
    version         Int           @default(1)
    deletedAt       DateTime?     @map("deleted_at") @db.Timestamptz(6)
    createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
    updatedAt       DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
    group           Group?        @relation(fields: [groupId], references: [id], onDelete: Restrict)
    payer           User          @relation("ExpensePayer", fields: [payerUserId], references: [id], onDelete: Restrict)
    createdBy       User          @relation("ExpenseCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
    participants    ExpenseParticipant[]
    revisions       ExpenseRevision[]
    @@index([groupId, status, occurredOn])
    @@index([payerUserId, status])
    @@map("expenses")
  }

  model ExpenseParticipant {
    expenseId  String @map("expense_id") @db.Uuid
    userId     String @map("user_id") @db.Uuid
    sharePaise BigInt @map("share_paise") @db.BigInt
    expense    Expense @relation(fields: [expenseId], references: [id], onDelete: Restrict)
    user       User    @relation(fields: [userId], references: [id], onDelete: Restrict)
    @@id([expenseId, userId])
    @@index([userId, expenseId])
    @@map("expense_participants")
  }

  model ExpenseRevision {
    id              String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    expenseId       String               @map("expense_id") @db.Uuid
    version         Int
    event           ExpenseRevisionEvent
    changedByUserId String               @map("changed_by_user_id") @db.Uuid
    beforeSnapshot  Json?                @map("before_snapshot")
    afterSnapshot   Json                 @map("after_snapshot")
    createdAt       DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
    expense         Expense              @relation(fields: [expenseId], references: [id], onDelete: Restrict)
    changedBy       User                 @relation("ExpenseRevisionActor", fields: [changedByUserId], references: [id], onDelete: Restrict)
    @@unique([expenseId, version])
    @@map("expense_revisions")
  }

  model SettlementRecord {
    id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    groupId         String?  @map("group_id") @db.Uuid
    senderUserId    String   @map("sender_user_id") @db.Uuid
    recipientUserId String   @map("recipient_user_id") @db.Uuid
    createdByUserId String   @map("created_by_user_id") @db.Uuid
    amountPaise     BigInt   @map("amount_paise") @db.BigInt
    occurredOn      DateTime @map("occurred_on") @db.Date
    note            String?
    createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
    group           Group?   @relation(fields: [groupId], references: [id], onDelete: Restrict)
    sender          User     @relation("SettlementSender", fields: [senderUserId], references: [id], onDelete: Restrict)
    recipient       User     @relation("SettlementRecipient", fields: [recipientUserId], references: [id], onDelete: Restrict)
    createdBy       User     @relation("SettlementCreator", fields: [createdByUserId], references: [id], onDelete: Restrict)
    @@index([senderUserId, occurredOn])
    @@index([recipientUserId, occurredOn])
    @@index([groupId, occurredOn])
    @@map("settlement_records")
  }

  model IdempotencyRecord {
    id             String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    userId         String            @map("user_id") @db.Uuid
    key            String
    requestHash    String            @map("request_hash")
    status         IdempotencyStatus @default(PENDING)
    responseStatus Int?              @map("response_status")
    responseBody   Json?             @map("response_body")
    expiresAt      DateTime          @map("expires_at") @db.Timestamptz(6)
    completedAt    DateTime?         @map("completed_at") @db.Timestamptz(6)
    createdAt      DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
    user           User              @relation(fields: [userId], references: [id], onDelete: Restrict)
    @@unique([userId, key])
    @@index([expiresAt])
    @@map("idempotency_records")
  }
  ```

  Use the model definitions above exactly. `ExpenseRevision.afterSnapshot` is required because every event produces a resulting state. `IdempotencyRecord.responseBody` is nullable solely for replaying a successful `204` delete response.

- [ ] **Step 3: Write the explicit SQL migration**

  Generate the migration through the repository’s Prisma workflow, then inspect and retain SQL that creates enum types, tables, foreign keys, composite keys, unique idempotency constraint, and indexes. Add SQL `CHECK` constraints that Prisma cannot express for positive paise, different settlement sender/recipient, and positive exact shares:

  ```sql
  ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_amount_paise_positive"
    CHECK ("amount_paise" > 0 AND "amount_paise" <= 10000000);

  ALTER TABLE "expense_participants"
    ADD CONSTRAINT "expense_participants_share_paise_positive"
    CHECK ("share_paise" > 0);

  ALTER TABLE "settlement_records"
    ADD CONSTRAINT "settlement_records_amount_paise_positive"
    CHECK ("amount_paise" > 0 AND "amount_paise" <= 10000000),
    ADD CONSTRAINT "settlement_records_distinct_parties"
    CHECK ("sender_user_id" <> "recipient_user_id");
  ```

  The service, not a database check, validates an expense’s multi-row share sum because PostgreSQL row checks cannot inspect sibling participant rows.

- [ ] **Step 4: Regenerate the Prisma client and inspect the generated relation names**

  Run the project’s Prisma generation command only when the user is ready to execute schema tooling. Confirm generated delegate names match the services in later tasks (`prisma.expense`, `prisma.settlementRecord`, and `prisma.idempotencyRecord`) before writing feature code.

- [ ] **Step 5: Commit the schema foundation**

  ```bash
  git add packages/database/prisma
  git commit -m "feat: add financial ledger schema"
  ```

## Task 2: Add MoneyModule shared services and composition

**Files:**
- Create: `apps/api/src/modules/money/{money.module.ts,shared/money-shared.module.ts,shared/money.service.ts,shared/idempotency.service.ts}`
- Modify: `apps/api/src/app.module.ts`
- Remove: `apps/api/src/modules/{expenses,payments,balances}/.gitkeep`

**Interfaces:**
- Consumes: `PrismaService`, `GroupMembershipService`, Nest dependency injection, and the Task 1 idempotency model.
- Produces: `MoneyService`, `IdempotencyService`, `MoneySharedModule`, and `MoneyModule`. Later feature modules import `MoneySharedModule` and inject the first two services.

- [ ] **Step 1: Implement exact decimal/paise conversion and share validation**

  Create `MoneyService` with a strict canonical decimal grammar: non-negative whole rupees plus exactly two optional fractional digits; reject whitespace, signs, exponent notation, commas, and more than two fractional digits. Convert using string arithmetic, not `Number`:

  ```ts
  export type ExactShareInput = { userId: string; share: string };

  export class MoneyService {
    public parsePositiveRupees(value: string): bigint;
    public formatPaise(value: bigint): string;
    public assertExactShares(amountPaise: bigint, shares: ExactShareInput[]): Map<string, bigint>;
  }
  ```

  `parsePositiveRupees("12.3")` returns `1230n`; `formatPaise(1230n)` returns `"12.30"`. `assertExactShares` rejects an empty list, duplicate user IDs, non-positive shares, and any sum different from `amountPaise`.

- [ ] **Step 2: Implement persisted idempotency claim and replay behavior**

  Canonically serialize only the method, route, authenticated user ID, and normalized request body before SHA-256 hashing. Expose a transaction-aware API so the same transaction writes the ledger fact and stored response.

  ```ts
  export type StoredIdempotentResponse<T> = {
    statusCode: number;
    body: T | null;
  };

  export type IdempotencyClaim<T> =
    | { kind: "new"; recordId: string }
    | { kind: "replay"; response: StoredIdempotentResponse<T> };

  public claim<T>(tx: Prisma.TransactionClient, userId: string, key: string, requestHash: string): Promise<IdempotencyClaim<T>>;
  public complete<T>(tx: Prisma.TransactionClient, recordId: string, response: StoredIdempotentResponse<T>): Promise<void>;
  public hashRequest(scope: string, body: unknown): string;
  ```

  Validate the `Idempotency-Key` header with `z.string().uuid()`. A matching completed record replays its stored response. The same user/key with another request hash, or a still-pending record, throws `ConflictException`. Set expiry to 24 hours after claim creation.

- [ ] **Step 3: Create private shared and public composition modules**

  `MoneySharedModule` provides and exports `MoneyService` and `IdempotencyService`. `MoneyModule` imports `GroupsModule`, `MoneySharedModule`, and the three feature modules created later. Keep `MoneyModule` as the only new import in `AppModule`:

  ```ts
  @Module({
    imports: [GroupsModule, MoneySharedModule, ExpensesModule, SettlementRecordsModule, BalancesModule],
    exports: [ExpensesModule, SettlementRecordsModule, BalancesModule],
  })
  export class MoneyModule {}
  ```

  Replace the three unused top-level placeholder directories only after the imports compile against the new paths.

- [ ] **Step 4: Register MoneyModule in AppModule**

  Import `MoneyModule` from `./modules/money/money.module.js` and append it to `AppModule` imports. Do not change existing auth, group, invitation, health, database, or worker registrations.

- [ ] **Step 5: Commit the financial module boundary**

  ```bash
  git add apps/api/src/app.module.ts apps/api/src/modules/money apps/api/src/modules/expenses apps/api/src/modules/payments apps/api/src/modules/balances
  git commit -m "feat: add money module foundation"
  ```

## Task 3: Implement immediate expense creation, reads, revisions, and mutations

**Files:**
- Create: `apps/api/src/modules/money/expenses/{expenses.module.ts,expenses.controller.ts,expenses.service.ts,expense-revision.service.ts,expense.schemas.ts,expense.dto.ts}`
- Modify: `apps/api/src/modules/money/money.module.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `AuthGuard`, `CurrentUser`, `PrismaService`, `GroupMembershipService`, `MoneyService`, and `IdempotencyService`.
- Produces: protected expense routes plus `ExpensesService.findById`, `create`, `update`, and `softDelete`; later Instamart code can call the exported expense-creation port rather than reimplement shares or revisions.

- [ ] **Step 1: Define schemas, request DTOs, and response DTOs**

  Define Zod schemas using strict objects. Use `z.string().uuid()` for user/group/expense IDs and `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` for `occurredOn`; parse the accepted calendar date with a UTC-safe helper before persistence.

  ```ts
  export const exactShareSchema = z.object({
    userId: z.string().uuid(),
    share: z.string(),
  }).strict();

  export const createExpenseSchema = z.object({
    title: z.string().trim().min(1).max(140),
    amount: z.string(),
    occurredOn: isoDateSchema,
    payerUserId: z.string().uuid(),
    groupId: z.string().uuid().optional(),
    participants: z.array(exactShareSchema).min(1),
  }).strict();

  export const updateExpenseSchema = z.object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(140).optional(),
    amount: z.string().optional(),
    occurredOn: isoDateSchema.optional(),
    payerUserId: z.string().uuid().optional(),
    groupId: z.string().uuid().nullable().optional(),
    participants: z.array(exactShareSchema).min(1).optional(),
  }).strict();
  ```

  `ExpenseDto` returns IDs, title, decimal `amount`, date string, payer ID, nullable group ID, status (`"active" | "deleted"`), version, timestamps, and ordered participant `{ userId, share }` entries. Never expose raw paise, Prisma `BigInt`, token state, or snapshots through this route.

- [ ] **Step 2: Implement revision snapshot creation**

  `ExpenseRevisionService` maps a selected current expense plus participants into a JSON-safe snapshot, ordering participants by `userId`. It owns the append-only revision write:

  ```ts
  export type ExpenseSnapshot = {
    title: string;
    amount: string;
    occurredOn: string;
    payerUserId: string;
    groupId: string | null;
    status: "active" | "deleted";
    participants: Array<{ userId: string; share: string }>;
  };

  public append(tx: Prisma.TransactionClient, input: {
    expenseId: string;
    version: number;
    event: "CREATED" | "UPDATED" | "DELETED";
    changedByUserId: string;
    before: ExpenseSnapshot | null;
    after: ExpenseSnapshot;
  }): Promise<void>;
  ```

  On creation, persist `beforeSnapshot: null`; on update/delete, persist both the prior and resulting snapshots. No revision is queried by balances.

- [ ] **Step 3: Implement expense authorization helpers**

  In `ExpensesService`, load all referenced users in one query and reject missing IDs with `NotFoundException("User not found")`. For a direct expense, require caller membership in the union of payer and participant IDs. For a group expense, first call `requireActiveMember` for caller, payer, and every participant before writing.

  For a read/edit/delete, allow the payer or a current participant. For a group read, also allow a current active group member. A removed member has historical access only if they remain the payer or a current participant of that expense. Do not use a generic group read as a bypass for a removed non-participant.

- [ ] **Step 4: Implement `POST /v1/expenses`**

  Controller extracts `@Headers("idempotency-key")`, validates it via `IdempotencyService`, and passes current user plus parsed request to `ExpensesService.create`. The service normalizes money/shares before a serializable transaction, claims the key, authorizes all users/group members, inserts `Expense` at version `1`, bulk creates participants, appends the `CREATED` revision, stores a `201` response in the idempotency record, then returns the response.

  ```ts
  @Post()
  public async create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ): Promise<ExpenseDto> {
    return this.expenses.create(user.id, requireIdempotencyKey(key), parseBody(createExpenseSchema, body));
  }
  ```

  Payer-only expenses are valid: the payer does not need a participant share. If the payer is also a participant, retain their share but exclude the self-obligation during balance derivation.

- [ ] **Step 5: Implement expense read, patch, and soft delete**

  Add guarded `GET /v1/expenses/:expenseId`, `PATCH /v1/expenses/:expenseId`, and `DELETE /v1/expenses/:expenseId` endpoints. The latter two require the idempotency key; `PATCH`/`DELETE` additionally require request-body `version` (for DELETE, accept `{ version: number }`).

  For patch, load the current expense and merge only supplied fields. If `amount` or `participants` changes, validate the final complete share set against the final amount. When group context changes, authorize the final payer/participants in the final group. Replace participant rows only when the `participants` field is supplied. Update with an atomic version predicate:

  ```ts
  const changed = await tx.expense.updateMany({
    where: { id: expenseId, version: input.version, status: "ACTIVE" },
    data: { ...nextFields, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw await this.staleVersionConflict(tx, expenseId);
  ```

  In the same transaction, write replacement shares when needed, append one `UPDATED` revision, and complete the stored idempotent response. For delete, update `status: "DELETED"`, set `deletedAt`, increment version with the same predicate, append the `DELETED` revision, and store/replay a `204` response. Never delete expense, participant, or revision records.

- [ ] **Step 6: Register and export the expense module**

  `ExpensesModule` imports `GroupsModule` and `MoneySharedModule`, provides the service/revision service, registers `ExpensesController`, and exports `ExpensesService`. Add it to `MoneyModule` imports/exports exactly once.

- [ ] **Step 7: Commit expense ledger behavior**

  ```bash
  git add apps/api/src/modules/money/expenses apps/api/src/modules/money/money.module.ts
  git commit -m "feat: add expense ledger"
  ```

## Task 4: Implement append-only settlement records

**Files:**
- Create: `apps/api/src/modules/money/settlement-records/{settlement-records.module.ts,settlement-records.controller.ts,settlement-records.service.ts,settlement-record.schemas.ts,settlement-record.dto.ts}`
- Modify: `apps/api/src/modules/money/money.module.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `AuthGuard`, `CurrentUser`, `PrismaService`, `GroupMembershipService`, `MoneyService`, and `IdempotencyService`.
- Produces: `POST /v1/settlement-records` and exported `SettlementRecordsService.create` for future flows that explicitly record a user-approved settlement.

- [ ] **Step 1: Define strict settlement-record input and output types**

  ```ts
  export const createSettlementRecordSchema = z.object({
    recipientUserId: z.string().uuid(),
    amount: z.string(),
    occurredOn: isoDateSchema,
    groupId: z.string().uuid().optional(),
    note: z.string().trim().min(1).max(280).optional(),
  }).strict();

  export type SettlementRecordDto = {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    amount: string;
    occurredOn: string;
    groupId: string | null;
    note: string | null;
    createdAt: Date;
  };
  ```

  Sender identity comes only from `@CurrentUser()`; do not accept it in the body. The controller parses an `Idempotency-Key` and returns `201` for new creation or the stored original response for a matching retry.

- [ ] **Step 2: Implement settlement authorization and write transaction**

  `SettlementRecordsService.create(senderUserId, key, input)` parses positive paise, rejects sender equals recipient, confirms the recipient exists, and—when `groupId` is supplied—calls `requireActiveMember` for sender and recipient. Then claim the caller key in a serializable transaction, insert one `SettlementRecord`, store the `201` response in its idempotency record, and commit.

  Settlement records are append-only: this Task 3 API has no update or delete endpoint. Correcting an entry means recording a new, explicit compensating settlement record later; no silent mutation is possible.

- [ ] **Step 3: Add protected controller and module wiring**

  ```ts
  @Controller("v1/settlement-records")
  @UseGuards(AuthGuard)
  export class SettlementRecordsController {
    @Post()
    public async create(
      @CurrentUser() user: AuthenticatedUser,
      @Headers("idempotency-key") key: string | undefined,
      @Body() body: unknown,
    ): Promise<SettlementRecordDto> {
      return this.settlementRecords.create(
        user.id,
        requireIdempotencyKey(key),
        parseBody(createSettlementRecordSchema, body),
      );
    }
  }
  ```

  Import `GroupsModule` and `MoneySharedModule` in `SettlementRecordsModule`, export `SettlementRecordsService`, and register the module in `MoneyModule`.

- [ ] **Step 4: Commit settlement records**

  ```bash
  git add apps/api/src/modules/money/settlement-records apps/api/src/modules/money/money.module.ts
  git commit -m "feat: add settlement records"
  ```

## Task 5: Implement read-only derived balance queries

**Files:**
- Create: `apps/api/src/modules/money/balances/{balances.module.ts,balances.controller.ts,balances.service.ts,balance.dto.ts}`
- Modify: `apps/api/src/modules/money/money.module.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `AuthGuard`, `CurrentUser`, `PrismaService`, and `GroupMembershipService`.
- Produces: `GET /v1/balances/friends`, `GET /v1/groups/:groupId/balance`, and exported `BalancesService` read methods.

- [ ] **Step 1: Define balance response types using decimal strings**

  ```ts
  export type PairwiseBalanceDto = {
    counterpartyUserId: string;
    direction: "you_owe" | "you_are_owed";
    amount: string;
  };

  export type GroupBalanceDto = {
    groupId: string;
    balances: Array<{
      fromUserId: string;
      toUserId: string;
      amount: string;
    }>;
  };
  ```

  Do not expose `bigint` values or return zero-net pairs. Format every returned paise amount through `MoneyService.formatPaise`.

- [ ] **Step 2: Implement the parameterized ledger aggregation query**

  Use one parameterized `$queryRaw` query with CTEs. Convert active expense shares into obligations `participant -> payer`, excluding payer self-shares. Union settlement records as `sender -> recipient` settlement reductions. Normalize each pair with `LEAST`/`GREATEST`, calculate signed totals relative to the normalized pair, and return only non-zero nets.

  ```sql
  WITH obligations AS (
    SELECT ep.user_id AS from_user_id, e.payer_user_id AS to_user_id, ep.share_paise::numeric AS amount_paise
    FROM expenses e
    JOIN expense_participants ep ON ep.expense_id = e.id
    WHERE e.status = 'ACTIVE'
      AND ep.user_id <> e.payer_user_id
      AND ($1::uuid IS NULL OR e.group_id = $1::uuid)
  ), movements AS (
    SELECT from_user_id, to_user_id, amount_paise FROM obligations
    UNION ALL
    SELECT sender_user_id, recipient_user_id, amount_paise::numeric
    FROM settlement_records
    WHERE $1::uuid IS NULL OR group_id = $1::uuid
  ), normalized AS (
    SELECT
      LEAST(from_user_id, to_user_id) AS left_user_id,
      GREATEST(from_user_id, to_user_id) AS right_user_id,
      CASE WHEN from_user_id = LEAST(from_user_id, to_user_id)
        THEN amount_paise ELSE -amount_paise END AS signed_paise
    FROM movements
  ), netted AS (
    SELECT left_user_id, right_user_id, SUM(signed_paise) AS net_paise
    FROM normalized
    GROUP BY left_user_id, right_user_id
  )
  SELECT left_user_id, right_user_id, net_paise
  FROM netted
  WHERE net_paise <> 0;
  ```

  The final SQL must support an optional group filter: apply it to both `expenses.group_id` and `settlement_records.group_id` before aggregation. Never write a balance row or cache result in Task 3.

- [ ] **Step 3: Implement authenticated-user and group balance methods**

  `getFriendBalances(userId)` calls the aggregate with no group filter and returns only pairs containing `userId`, translated to `you_owe` or `you_are_owed`. `getGroupBalance(requesterId, groupId)` first calls `requireActiveMember(groupId, requesterId)`, then runs the same aggregate restricted to that group and returns directional user-ID pairs.

- [ ] **Step 4: Add guarded routes and module wiring**

  ```ts
  @Controller("v1")
  @UseGuards(AuthGuard)
  export class BalancesController {
    @Get("balances/friends")
    public getFriendBalances(@CurrentUser() user: AuthenticatedUser): Promise<PairwiseBalanceDto[]>;

    @Get("groups/:groupId/balance")
    public getGroupBalance(
      @CurrentUser() user: AuthenticatedUser,
      @Param("groupId") groupId: string,
    ): Promise<GroupBalanceDto>;
  }
  ```

  Validate `groupId` through the existing `groupIdSchema`. `BalancesModule` imports `GroupsModule` and `MoneySharedModule`, provides/exports `BalancesService`, and is registered in `MoneyModule`.

- [ ] **Step 5: Commit derived balances**

  ```bash
  git add apps/api/src/modules/money/balances apps/api/src/modules/money/money.module.ts
  git commit -m "feat: add derived balances"
  ```

## Task 6: Complete module integration and handoff

**Files:**
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/modules/money/money.module.ts`, and files touched by Tasks 1–5 only when required to resolve module exports or generated Prisma delegate names.
- Remove: obsolete empty financial placeholder directories after the replacement `MoneyModule` paths are registered.

**Interfaces:**
- Consumes: all Task 1–5 financial components.
- Produces: one registered `MoneyModule` with no top-level legacy finance module imports and a manual schema/build handoff for the user.

- [ ] **Step 1: Inspect route and module registration for duplicate or legacy paths**

  Confirm the application registers exactly these financial endpoints and no `v1/payments` route:

  ```text
  POST   /v1/expenses
  GET    /v1/expenses/:expenseId
  PATCH  /v1/expenses/:expenseId
  DELETE /v1/expenses/:expenseId
  POST   /v1/settlement-records
  GET    /v1/balances/friends
  GET    /v1/groups/:groupId/balance
  ```

  Confirm only `MoneyModule` is newly imported by `AppModule`; controllers remain internal to focused feature modules.

- [ ] **Step 2: Inspect financial mutation paths against the approved invariants**

  Manually review create, patch, delete, and settlement paths for: decimal-string parsing; paise bounds; share sum; direct/group authorization; serializable transactions; idempotency replay; atomic version predicate; immutable revisions; append-only settlements; and no mutable balance table. Do not add test files or invoke test/build commands in this task.

- [ ] **Step 3: Hand schema/build execution to the user**

  Ask the user to run the repository’s Prisma generation, migration, and build commands in their chosen environment. Record any reported compile, migration, or runtime error as a separate debugging task rather than modifying unrelated modules preemptively.

- [ ] **Step 4: Commit final Task 3 implementation integration**

  ```bash
  git add apps/api/src/app.module.ts apps/api/src/modules/money packages/database/prisma
  git commit -m "feat: add money ledger and balances"
  ```

## Coverage review

- Direct and group immediate expenses, registered-user eligibility, and authorization: Task 3.
- Exact paise parsing, bounds, and exact-share invariants: Tasks 1–3.
- Current facts, participant shares, immutable revisions, and soft deletion: Tasks 1 and 3.
- `settlement_records` naming and append-only settlement writes: Tasks 1 and 4.
- Per-user UUID idempotency replay and conflict behavior: Tasks 1–4.
- Optimistic expense-version conflict behavior: Task 3.
- Pairwise friend balances and group-scoped balances with no stored balance table: Task 5.
- One public financial boundary, `MoneyModule`, with focused internal feature modules: Task 2.
- Smart group debt, contact discovery, participant acceptance, OTP enforcement, Activity/outbox, and all automated testing: explicitly deferred.
