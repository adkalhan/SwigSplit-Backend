# Financial Ledger and Balances Design

## Purpose

Task 3 adds SwigSplit's financial source of truth: direct and group expenses, exact shares, revisions, soft deletion, settlements, idempotent mutations, and derived balances. It extends the identity and group foundation without adding a friendship or contact-discovery subsystem.

## Scope

The private beta supports two kinds of immediately active manual expenses:

- **Direct expense:** `groupId` is absent. A registered user creates an expense involving one or more other registered users without creating a group.
- **Group expense:** `groupId` is present. The payer and every participant must be an active member of that group at the time the mutation is validated.

An expense is active as soon as its creation transaction commits. Added participants do not approve, reject, or otherwise gate the effect of their shares. During the private beta, a registered user may be a payer, participant, or settlement party even when `phoneVerifiedAt` is null. Post-beta OTP enforcement changes this eligibility rule without changing the ledger data model.

This task does not add a stored friendship/contact graph, participant acceptance, phone-number account lookup, Activity records, notifications, outbox processing, Instamart orders, percentage splits, item assignment, multiple payers, or debt optimization.

## Public contract

All routes are JSON REST endpoints below `/v1` and require the existing bearer-token guard. Financial mutation endpoints require a UUID `Idempotency-Key` request header. The client creates one key per logical mutation and reuses that exact key only when retrying it.

```text
POST   /v1/expenses
GET    /v1/expenses/:expenseId
PATCH  /v1/expenses/:expenseId
DELETE /v1/expenses/:expenseId

POST   /v1/settlement-records
GET    /v1/balances/overview
GET    /v1/balances/friends
GET    /v1/groups/:groupId/balance
```

`POST /v1/expenses` accepts a title, exact decimal-rupee amount, ISO calendar date, payer user ID, optional group ID, and an array of exact participant shares expressed as user IDs and decimal-rupee strings. `PATCH` accepts only changed current-state fields plus the required current version. `DELETE` requires the required current version. The API returns `409 Conflict` with the current expense representation for a stale version.

`POST /v1/settlement-records` accepts sender user ID, recipient user ID, exact decimal-rupee amount, ISO calendar date, optional group ID, and optional note. A settlement record documents a settlement only; it never invokes a banking or payment provider.

The API uses user UUIDs, never phone numbers, to identify direct-expense participants. This preserves a clean ledger boundary and avoids creating a phone-based account-discovery endpoint. Clients can use identities already available through authenticated product views; contact discovery is separate future product work.

## Authorization

For every expense mutation, the authenticated caller must be a current participant or the payer. For create, the caller must appear in the submitted payer/participant set. For update and soft deletion, the caller must be a participant in the current expense or its payer.

For a group expense, the service verifies that the group exists and is not archived, and verifies active membership for the caller, payer, and each participant in the same write transaction. A removed member cannot be added to a new group expense. They retain access to an expense only when they were a current participant in that expense before removal; Task 3 enforces this for expense reads, edits, and deletion.

For a direct expense, every payer and participant must exist as a registered user. There is intentionally no friendship prerequisite and no recipient-acceptance workflow.

A settlement-record sender must be the authenticated caller. Its recipient must be a distinct registered user. If a group context is supplied, both parties must currently be active members of that group.

## Financial invariants

- Money enters the API as a canonical decimal rupee string and is parsed without JavaScript floating point.
- Stored money is PostgreSQL `BIGINT` paise. API responses format paise back to canonical decimal rupee strings.
- Every expense and settlement-record amount is greater than ₹0.00 and no more than ₹100,000.00. Because amounts are stored in paise, the smallest valid amount is ₹0.01.
- An expense has exactly one payer and at least one participant.
- Participant user IDs are distinct and their exact shares sum exactly to the expense amount.
- The payer may also be a participant; their share represents their own portion and produces no debt to themselves.
- A settlement-record amount is positive and its sender and recipient differ.
- A current expense is either `ACTIVE` or `DELETED`. Deleted expenses and all of their shares are excluded from balance calculations.
- Current balances derive only from active expense shares and append-only settlement records. There is no stored or mutable balance record.

## Persistence model

Task 3 adds the following PostgreSQL-backed records through Prisma and one migration.

| Record | Responsibility |
| --- | --- |
| `Expense` | Current state: title, amount paise, occurred-on date, payer, optional group, source `MANUAL`, status, version, creator, deletion timestamp, and timestamps. |
| `ExpenseParticipant` | One current exact share per `(expense, user)` pair. |
| `ExpenseRevision` | Append-only immutable resulting-state snapshot for create, update, and delete, including actor and version. It is never a balance input. |
| `SettlementRecord` | Append-only direct or group-context settlement with sender, recipient, amount paise, date, optional note, creator, and timestamps. |
| `IdempotencyRecord` | Per-user mutation key, request fingerprint, pending/completed response state, returned status/body, and expiry. It prevents a network retry from recording another expense, edit, delete, or settlement record. |

The expense participant primary key is `(expenseId, userId)`. `Expense` indexes its optional group and active/deleted state; `SettlementRecord` indexes each party, optional group, and occurrence date. `IdempotencyRecord` has unique `(userId, key)` and stores a SHA-256 request fingerprint, not raw sensitive request data.

Expense revisions serialize snapshots as JSON values containing only immutable audit-relevant fields: current expense state and ordered exact-share entries. Revision number matches the expense version recorded by that event. Creation records version `1`; each edit increments version; deletion increments version and records the deleted state.

Task 3 does not create Activity, Notification, or Outbox records. Those models and their worker processing belong to Task 4. The expense and settlement-record services expose narrow event payload construction seams only if Task 4 needs to attach transactional writers later; no fake outbox table or unprocessed job is introduced now.

## Mutation flow and concurrency

Every financial mutation executes inside one serializable Prisma transaction:

1. Validate and normalize the request into paise and canonical domain values before persistence.
2. Claim or replay the caller's idempotency record. The same key with a different request fingerprint returns `409`; a completed matching record returns the stored response without reapplying the mutation.
3. Load and authorize current users, group membership when applicable, and the current expense when editing or deleting.
4. For an expense edit or deletion, condition the write on the submitted version. A failed conditional update loads the latest representation and returns `409 Conflict`.
5. Write the expense/settlement-record state, replacement participant set if applicable, and immutable revision in the same transaction.
6. Persist the successful HTTP response in the idempotency record before committing.

Concurrent expense edits therefore allow only the transaction whose expected version still matches. A later writer receives the latest expense and must deliberately reapply its intended change. Concurrent retries of one idempotency key return one durable result.

## Balance derivation

The balance module uses parameterized, tested PostgreSQL aggregation queries rather than a mutable balance table.

For every active expense participant with share `s` and payer `p`, create a directed obligation `participant -> p` of `s`, except when the participant is `p`. For every settlement record from `a` to `b` of `x`, create a directed settlement `a -> b` of `x`. Aggregate all obligations and settlements by unordered user pair, net the two directions, then expose the remaining direction and paise amount.

`GET /v1/balances/overview` returns one landing-page payload: global net pairwise friend balances across both direct and group transactions; for every group where the authenticated user is active, the user's owed/owing position and the group's total outstanding debt; and global owed/owing totals derived from the friend balances. Settlement records affect these calculations but are never returned as items. `GET /v1/balances/friends` returns only the authenticated user's net pairwise friend balances. `GET /v1/groups/:groupId/balance` first requires current active membership, then returns the group's net pairwise balances using only expenses and settlement records whose `groupId` matches. Balance responses contain integer-safe decimal strings, never JavaScript numeric amounts.

## Module boundaries

`MoneyModule` is the only financial module imported by `AppModule`. It composes the focused internal modules below without introducing a catch-all `MoneyService` that forwards every operation.

```text
modules/money/
  money.module.ts
  shared/
    money.service.ts
    idempotency.service.ts
  expenses/
    expenses.module.ts
    expenses.service.ts
    expenses.controller.ts
    expense-revision.service.ts
  settlement-records/
    settlement-records.module.ts
    settlement-records.service.ts
    settlement-records.controller.ts
  balances/
    balances.module.ts
    balances.service.ts
    balances.controller.ts
```

- `MoneyModule` imports the three feature modules and exports only the narrow interfaces later product modules need.
- `modules/money/shared/money.service.ts` owns rupee-string parsing, paise formatting, limits, and share-total validation.
- `modules/money/shared/idempotency.service.ts` owns header parsing, request fingerprinting, claim/replay behavior, and persisted response mapping.
- `modules/money/expenses` owns expense schemas, authorization, current-state persistence, revision snapshots, optimistic versions, and routes.
- `modules/money/settlement-records` owns settlement schemas, authorization, persistence, and routes.
- `modules/money/balances` owns read-only SQL aggregation and balance routes.
- `GroupsModule` remains the sole owner of active group-membership checks through `GroupMembershipService`; money modules must not duplicate its membership query logic.

## Error behavior

Invalid UUIDs, dates, money strings, missing fields, excess fields, malformed idempotency keys, non-positive amounts, duplicate participants, and share-total mismatches return the project-standard `400` error shape. Missing users, groups, expenses, or settlement records return `404` without leaking unrelated records. Unauthorized caller/resource combinations return `403`. A conflicting idempotency fingerprint, reuse of an in-progress key, invalid membership transition, or stale version returns `409`; stale-version bodies include the latest expense representation.

## Deferred work

- OTP verification and enforcement after the private beta.
- Contact discovery, contact permissions, and a stored friendship graph.
- Participant acceptance/rejection or dispute workflows.
- Percentage, unequal shorthand, or item-level split modes; Task 3 accepts exact shares only.
- Multiple payers and payment-provider execution.
- **Smart group debt settlement:** calculate a minimized set of suggested transfers across all members of one group (for example, replace several offsetting pairwise debts with fewer transfers). Suggestions must never rewrite expenses, shares, or settlement records; users explicitly record any resulting settlement.
- Activity, notifications, and outbox delivery.
- Automated unit, integration, and concurrency testing is deferred from the current Task 3 implementation scope.
