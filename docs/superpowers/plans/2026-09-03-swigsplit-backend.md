# SwigSplit Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single TypeScript/NestJS/Fastify backend that safely manages SwigSplit identities, shared-expense records, balances, carts, and Swiggy Instamart order linkage.

**Architecture:** Use a modular NestJS monolith with Fastify, PostgreSQL, Prisma, Redis/BullMQ, and a separate worker process. Ledger facts are stored transactionally; balances are derived from active expense shares and payments; Instamart is isolated behind a server-side MCP adapter.

**Tech Stack:** TypeScript, NestJS, Fastify, PostgreSQL, Prisma, Redis, BullMQ, Zod, Pino, Jest/Vitest, Supertest.

**Spec:** `docs/swigsplit-backend-architecture.md`

## Global Constraints

- Store money as integer paise; accept exact decimal rupee strings and reject values outside ₹1–₹100,000.
- Use `/v1` JSON REST endpoints and `GET /v1/user` for the authenticated user.
- Use random UUID idempotency keys per logical financial action; reuse only on retry.
- Use optimistic `version` checking for expense mutations.
- Maximum 20 active members per group.
- Keep OTP state in Redis and Swiggy tokens encrypted and server-side.
- No AI may decide or execute cart or money mutations.
- Keep MVP automated tests limited to high-risk financial, permission, and checkout behavior.

---

## Planned file structure

```text
apps/api/src/{main.ts,app.module.ts}
apps/api/src/shared/{config,database,errors,validation,auth,idempotency,encryption,logging}/
apps/api/src/modules/{auth,users,groups,expenses,payments,balances,lists,draft-carts,instamart,activity,notifications}/
apps/worker/src/{main.ts,worker.module.ts,jobs/}
packages/database/{prisma/schema.prisma,prisma/migrations/}
packages/shared/src/
tests/{unit,integration,e2e}/
```

## Task 1: Bootstrap and operational foundation

**Files:** Create package/workspace configuration, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/worker/src/main.ts`, `apps/worker/src/worker.module.ts`, `packages/database/prisma/schema.prisma`, and `tests/integration/health.spec.ts`.

**Produces:** A Fastify-backed Nest API, a worker process, PostgreSQL/Redis configuration, structured logging, `GET /health`, and `GET /ready`.

- [ ] Add failing health/readiness integration tests for process liveness and unavailable dependencies.
- [ ] Configure Fastify request IDs, CORS allowlist, body limits, compression, Pino logging, and global error serialization.
- [ ] Configure Prisma/PostgreSQL and Redis/BullMQ connections with graceful shutdown.
- [ ] Implement `/health` and `/ready`; readiness checks PostgreSQL and Redis.
- [ ] Run the health integration tests against local PostgreSQL/Redis and commit `chore: bootstrap backend foundation`.

## Task 2: Verified identity and groups

**Files:** Create `modules/auth/*`, `modules/users/*`, `modules/groups/*`, corresponding Prisma models/migration, and tests under `tests/unit/auth` and `tests/integration/groups`.

**Produces:** OTP verification, sessions, `GET /v1/user`, groups, invitations, membership removal/re-add, and the 20-member cap.

- [ ] Add tests for valid/expired OTP state, removed-member rejection, re-add behavior, and a 21st active member rejection.
- [ ] Store hashed OTP/attempt/expiry data in Redis; on successful verification set `users.phone_verified_at`.
- [ ] Implement hashed refresh-token sessions and authenticated user guard.
- [ ] Implement group/invite/membership services with a locked group transaction for the active-member limit.
- [ ] Expose `POST /v1/auth/send-verification-code`, `POST /v1/auth/verify-verification-code`, `GET /v1/user`, and group/invite endpoints.
- [ ] Run focused unit/integration tests and commit `feat: add verified users and groups`.

## Task 3: Financial ledger and balances

**Files:** Create `modules/expenses/*`, `modules/payments/*`, `modules/balances/*`, Prisma migration/models, and tests under `tests/unit/expenses` and `tests/integration/balances`.

**Produces:** Current expenses/shares, revisions, soft deletion, partial payments, idempotency, optimistic edits, and derived balance views.

- [ ] Add failing tests for exact share totals, ₹100,000 upper bound, partial payment netting, soft deletion, duplicate idempotency request, and version conflict.
- [ ] Parse rupee decimal strings without JavaScript floating-point arithmetic, then persist paise in `bigint` columns.
- [ ] Implement expense service transactions that write expense, participant rows, revisions, Activity/outbox rows, and response idempotency records atomically.
- [ ] Implement append-only payments and SQL-backed pairwise/group balance queries from active shares plus payments.
- [ ] Expose expense, payment, and balance endpoints with `409` stale-version responses.
- [ ] Run focused tests and commit `feat: add expense ledger and balances`.

## Task 4: Activity, lists, and draft carts

**Files:** Create `modules/activity/*`, `modules/notifications/*`, `modules/lists/*`, `modules/draft-carts/*`, worker outbox job files, migrations, and related integration tests.

**Produces:** Durable activity/notification records, reliable outbox processing, personal/group lists, and zero-or-one active cart per user/group.

- [ ] Add tests for personal/group list isolation, one active cart constraint, and outbox creation on an expense event.
- [ ] Implement activity, notification, and outbox repositories; worker claims and marks events processed with retry metadata.
- [ ] Implement list ownership/group membership authorization and list-item persistence.
- [ ] Implement personal draft carts using a partial unique database index for active carts.
- [ ] Expose activity, notification, list, and draft-cart endpoints.
- [ ] Run focused tests and commit `feat: add lists carts and activity`.

## Task 5: Instamart adapter and checkout lifecycle

**Files:** Create `modules/instamart/{instamart.module.ts,instamart.service.ts,swiggy-mcp.adapter.ts,checkout.service.ts,*.schema.ts}`, migrations, worker jobs, and mocked integration tests.

**Produces:** OAuth connection, encrypted credentials, product/address access, cart validation, explicit payment handoff, checkout records, and linked confirmed orders.

- [ ] Add mocked tests for a provider validation failure that preserves a draft, a pending UPI payment that creates no expense, and a confirmed order that creates exactly one expense.
- [ ] Implement OAuth 2.1 + PKCE callback and encrypted connection storage; never send tokens to the browser.
- [ ] Implement a typed deterministic MCP adapter; map external failures to `requires_cart_review` or `provider_unavailable`.
- [ ] Implement checkout state transitions: `building`, `ready_for_payment`, `pending_payment`, `payment_failed`, and `order_confirmed`; return `requires_cart_review` for cart issues and `provider_unavailable` for Swiggy technical failures.
- [ ] On confirmation, create the expense/shares/order link in one transaction and mark the draft checked out.
- [ ] Expose Instamart connection, search, addresses, cart validation, payment-options, checkout, and order-status endpoints.
- [ ] Run mocked integration tests and a short manual Swiggy staging checklist; commit `feat: add instamart checkout flow`.

## Task 6: MVP hardening and pilot readiness

**Files:** Create Home aggregate query/module, deployment configuration, operational runbook, and end-to-end tests for the critical paths.

**Produces:** Home summary, deployable configuration, backup/recovery check, and a small pilot-ready acceptance checklist.

- [ ] Add one end-to-end manual-expense-to-partial-settlement test and one mocked cart-to-confirmed-order test.
- [ ] Implement Home balance, group-spending, and draft-cart summary query endpoints.
- [ ] Add production environment validation, secret documentation, migration/backup instructions, and alerting/logging configuration.
- [ ] Run the MVP test suite, staging checklist, and backup-restore rehearsal.
- [ ] Commit `feat: prepare backend for household pilot`.

## Coverage review

- Identity, groups, membership history, and cap: Task 2.
- Expenses, revisions, payments, balances, versioning, and idempotency: Task 3.
- Lists, personal carts, activity, notifications, and outbox: Task 4.
- OAuth, Swiggy adapter, payment states, and order linkage: Task 5.
- Home, operations, and pilot readiness: Task 6.
