# Registration, Sessions, and Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add no-OTP phone registration, rotating server-side sessions, authenticated-user retrieval, and separate app- and group-invitation lifecycles to the Task 1 backend foundation; OTP verification follows after the private beta.

**Architecture:** During the private beta, registration accepts an E.164 phone number without OTP and creates or retrieves that user before issuing a short-lived signed access token and rotating opaque refresh token. Prisma is the authoritative store for users, sessions, groups, separate `AppInvite` and `GroupInvite` records, and membership history. OTP later changes the registration/verification step without changing the session or group modules. Group services authorize each mutation and lock the group row before adding or reactivating a member, so the twenty-active-member limit cannot be exceeded concurrently.

**Tech Stack:** TypeScript, NestJS 11, Fastify 5, PostgreSQL 16, Prisma 6, Redis/ioredis, Zod, `jose`, Vitest, Nest testing utilities.

**Spec:** `docs/swigsplit-backend-architecture.md`, `../docs/2026-08-31-swigsplit-design.md`, and Task 2 in `docs/superpowers/plans/2026-09-03-swigsplit-backend.md`.

## Global Constraints

- **Deferred product decision (2026-09-07):** OTP verification is explicitly out of scope for the private beta. Registration creates an unverified user from a supplied E.164 phone number; do not implement OTP sending, OTP validation, phone-verification enforcement, or SMS-provider integration until after the private beta has concluded.
- The private-beta registration flow is intentionally simple and must not block groups, expenses, lists, carts, or other backend tasks. OTP later replaces only the proof-of-phone step.
- All API endpoints added here are JSON REST endpoints below `/v1`; `GET /v1/user` returns the authenticated user.
- Production participants must have a verified SwigSplit account before participating in expenses. During the private beta, any registered user may participate without a populated `users.phone_verified_at` value.
- `GroupInvite` and `AppInvite` are separate concepts. An app invite never stores a group ID and can never grant group membership.
- A current group member generates a bearer `GroupInvite` link without supplying or storing a recipient phone number. The backend persists only the group, creator, token hash, and expiry; the link may be sent through any channel.
- The recipient enters their phone number after opening the link. Private-beta registration creates or retrieves that user and redeems the link in one transaction. A `GroupInvite` redemption adds/reactivates that account's membership, enforces the 20-active-member cap, and creates the corresponding membership Activity/notification effects.
- An app-only invite is the same bearer-link lifecycle without a group association. It stores only token lifecycle data; redemption creates or retrieves the account but never creates group membership.
- Invite creation cannot infer whether the eventual recipient already has an account. Existing users are added only when they authenticate/register through the link; new users are created and added during that same redemption flow.
- Any current active group member may invite or remove a member.
- Removal prevents future default participation but must retain the single membership record and its historical timestamps; re-adding reactivates that record.
- A group may have at most 20 active members, enforced in the database transaction, not only by an application-side pre-check.
- Never log an access token, refresh token, or Authorization header.
- Access tokens are short lived. Refresh tokens are random opaque values, stored only as a hash, and rotate on every successful refresh.
- All environment values are validated through `apps/api/src/shared/config/environment.ts`; secrets never enter source control.
- `APP_WEB_URL` is a validated HTTPS origin and is used only to construct the returned signup link.
- Preserve the Task 1 global exception shape: `{ statusCode, error, message, requestId }`.

---

## Deferred work — complete after private beta

- [ ] Implement the Redis-backed OTP send/verify flow, including expiry, attempt limits, and per-phone/IP request limits.
- [ ] Mark users as verified only after successful OTP validation and require that verified identity for standard group membership, invitations, expenses, settlements, and Instamart checkout.
- [ ] Add OTP verification to registration while retaining the existing short-lived access tokens, rotating opaque refresh tokens, logout, and authenticated `GET /v1/user`.
- [ ] Select and integrate an SMS delivery provider without exposing OTP values in API responses or logs.

This deferral applies only to proof of phone ownership. Tasks 2–7 remain executable during the private beta through no-OTP registration; the post-beta OTP work extends that registration flow.

## Deferred pre-production work

- [ ] Configure the public API behind HTTPS before staging or production exposure. Prefer TLS termination at a reverse proxy/load balancer with certificate renewal, HTTP-to-HTTPS redirect, HSTS, and trusted-proxy settings. Plain HTTP remains acceptable only for local `localhost` development or a trusted internal hop behind that proxy.
- [ ] Complete the deferred identity test infrastructure: configure an independent `TEST_DATABASE_URL`, add the Prisma test-database helper, and restore the identity/group schema-invariant integration tests when database-backed test execution is enabled.

---

## Planned file structure

```text
apps/api/src/
  app.module.ts                                      # Registers identity and group modules
  shared/
    config/environment.ts                            # Adds session environment validation
    database/prisma.service.ts                       # Adds transaction and testable lock helper only if needed
    errors/{api-exception.ts,http-exception.filter.ts}
    validation/parse-body.ts                         # Zod body parsing helper
  modules/
    auth/
      {auth.module.ts,auth.controller.ts,auth.service.ts,auth-user.ts,auth.guard.ts,
       session.service.ts,token.service.ts,auth.schemas.ts}
    users/{users.module.ts,users.controller.ts,users.service.ts}
    groups/
      {groups.module.ts,groups.controller.ts,groups.service.ts,
       group-invitations.service.ts,groups.schemas.ts,group-membership.service.ts}
    invitations/
      {invitations.module.ts,app-invitations.service.ts,invite-redemption.port.ts,invite-token.service.ts}
packages/database/prisma/
  schema.prisma
  migrations/<timestamp>_identity_and_invites/migration.sql
tests/
  helpers/{api-test-app.ts,prisma-test-database.ts}
  integration/{auth.spec.ts,groups.spec.ts}
```

`auth` owns registration and session issuance; `users` exposes only the authenticated user resource; `groups` owns groups, membership authorization, and group invitations; `invitations` owns app-only invitations plus the shared opaque-token/redemption boundary. Controllers parse HTTP data and shape responses, while services own authorization and Prisma/Redis mutations.

## Module boundaries and standalone tests

- Each module owns its controllers, schemas, services, unit tests, and module-specific integration tests. It may depend only on shared infrastructure (`PrismaService`, configuration, errors, and request validation) and explicit interfaces exported by another module.
- `AuthModule` exports `AuthGuard`, `CurrentUser`, and the `AuthenticatedUser` type. Other modules must receive the current user as an argument; they must not call `AuthService` or query sessions directly.
- `GroupsModule` exports `GroupMembershipService.requireActiveMember(groupId, userId)`. Future expense, list, and cart modules use this interface rather than its controllers or Prisma queries.
- `InvitationsModule` exports `InviteRedemptionPort.redeem(tx, inviteToken, userId): Promise<void>`, where `tx` is Prisma's transaction client. It resolves an `AppInvite` or `GroupInvite` through a shared token utility; only the group-invite branch calls `GroupMembershipService.addOrReactivate`. `AuthModule` calls only this interface inside its registration transaction; it does not import invitation repositories or membership implementation details.
- Unit tests mock imported interfaces and test a single service without an HTTP server or database. Each module additionally has an integration test that boots only that module plus test infrastructure and exercises its own routes.
- Modules are therefore independently testable and replaceable at their public interface. They are not dependency-free: groups correctly depend on the authenticated user identity, but that dependency is narrow, explicit, and mockable.

### Task 1: Define persistent identity and group records

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_verified_identity_and_groups/migration.sql`
- Deferred: `tests/helpers/prisma-test-database.ts` and `tests/integration/groups.spec.ts`

**Interfaces:**
- Consumes: Task 1's `PrismaService` and `DATABASE_URL` configuration.
- Produces: Prisma models `User`, `Session`, `Group`, `GroupMember`, `GroupInvite`, and `AppInvite`; enums `GroupMemberStatus` (`ACTIVE`, `REMOVED`) and `InviteStatus` (`PENDING`, `ACCEPTED`, `CANCELLED`, `EXPIRED`). Later tasks use `GroupMember.status` and the authenticated user ID for authorization.

- [ ] **Step 1: Write the failing schema-invariant tests (deferred)**

Create `tests/integration/groups.spec.ts` with a setup that creates a temporary database schema through `prisma migrate deploy`, then add these assertions:

```ts
it("allows a normalized phone number only once", async () => {
  await prisma.user.create({ data: { phoneE164: "+919876543210" } });
  await expect(prisma.user.create({ data: { phoneE164: "+919876543210" } }))
    .rejects.toMatchObject({ code: "P2002" });
});

it("allows one membership record for a group and user", async () => {
  const { group, user } = await seedGroupAndUser();
  await prisma.groupMember.create({ data: { groupId: group.id, userId: user.id, status: "ACTIVE" } });
  await expect(prisma.groupMember.create({ data: { groupId: group.id, userId: user.id, status: "ACTIVE" } }))
    .rejects.toMatchObject({ code: "P2002" });
});
```

- [ ] **Step 2: Run the invariant tests to verify they fail (deferred)**

Run: `npm run test:integration -- tests/integration/groups.spec.ts`

Expected: FAIL because the Prisma client has no identity/group models and the test database helper does not exist.

- [ ] **Step 3: Add the Prisma data model and migration**

Add the following model shape to `packages/database/prisma/schema.prisma` (use `@db.Timestamptz(6)` for timestamps and UUID primary keys generated by PostgreSQL):

```prisma
model User {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  phoneE164       String   @unique @map("phone_e164")
  phoneVerifiedAt DateTime? @map("phone_verified_at") @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  sessions        Session[]
  memberships     GroupMember[]
  sentGroupInvites GroupInvite[] @relation("GroupInviteSender")
  @@map("users")
}

model Group {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  members     GroupMember[]
  invites     GroupInvite[]
  @@map("groups")
}

model GroupMember {
  groupId      String            @map("group_id") @db.Uuid
  userId       String            @map("user_id") @db.Uuid
  status       GroupMemberStatus @default(ACTIVE)
  joinedAt     DateTime          @default(now()) @map("joined_at") @db.Timestamptz(6)
  lastJoinedAt DateTime          @default(now()) @map("last_joined_at") @db.Timestamptz(6)
  removedAt    DateTime?         @map("removed_at") @db.Timestamptz(6)
  group        Group             @relation(fields: [groupId], references: [id], onDelete: Restrict)
  user         User              @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@id([groupId, userId])
  @@index([userId, status])
  @@map("group_members")
}
```

Add `Session` with a unique `tokenHash`, `userId`, `expiresAt`, `revokedAt`, and `replacedBySessionId`. Replace `Invite` with two models that share the `InviteStatus` lifecycle and a token-hashing utility:

```prisma
model GroupInvite {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  groupId         String       @map("group_id") @db.Uuid
  invitedByUserId String       @map("invited_by_user_id") @db.Uuid
  tokenHash       String       @unique @map("token_hash")
  status          InviteStatus @default(PENDING)
  expiresAt       DateTime     @map("expires_at") @db.Timestamptz(6)
  acceptedAt      DateTime?    @map("accepted_at") @db.Timestamptz(6)
  group           Group        @relation(fields: [groupId], references: [id], onDelete: Restrict)
  invitedBy       User         @relation("GroupInviteSender", fields: [invitedByUserId], references: [id], onDelete: Restrict)
  @@index([groupId, status], map: "group_invites_group_status_idx")
  @@map("group_invites")
}

model AppInvite {
  id         String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tokenHash  String       @unique @map("token_hash")
  status     InviteStatus @default(PENDING)
  expiresAt  DateTime     @map("expires_at") @db.Timestamptz(6)
  acceptedAt DateTime?    @map("accepted_at") @db.Timestamptz(6)
  @@index([status])
  @@map("app_invites")
}
```

Both raw tokens are returned only when created and are never persisted. `GroupInvite` deliberately has no recipient phone/email column: it is a bearer link. An `AppInvite` has no group, recipient, membership relation, or permission effect. Generate the migration with `npx prisma migrate dev --schema packages/database/prisma/schema.prisma --name identity_and_invites`; edit generated SQL only to add `CREATE EXTENSION IF NOT EXISTS pgcrypto` before UUID defaults and the lookup indexes.

- [ ] **Step 4: Add an isolated Prisma test-database helper (deferred)**

Implement `tests/helpers/prisma-test-database.ts` so tests use `TEST_DATABASE_URL`, truncate tables in dependency order after every test, and throw a clear error if that variable is absent:

```ts
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required for database integration tests");
  return url;
}
```

Instantiate `PrismaClient` with that URL and export `truncateIdentityTables()` that executes `TRUNCATE TABLE app_invites, group_invites, group_members, sessions, groups, users RESTART IDENTITY CASCADE`.

- [ ] **Step 5: Run the invariant tests to verify they pass (deferred)**

Run: `TEST_DATABASE_URL='postgresql://swigsplit:swigsplit@localhost:5432/swigsplit_test' npm run test:integration -- tests/integration/groups.spec.ts`

Expected: PASS. The unique phone and composite group membership constraints reject duplicates.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add packages/database/prisma
git commit -m "feat: add identity and group schema"
```

### Task 2: Add no-OTP registration and signed access tokens

**Files:**
- Modify: `apps/api/src/shared/config/environment.ts`
- Create: `apps/api/src/modules/auth/{auth.module.ts,auth.schemas.ts,token.service.ts}`
- Create: `apps/api/src/modules/users/{users.module.ts,users.service.ts}`

**Interfaces:**
- Consumes: `Environment` and the `User` model from Task 1.
- Produces: `UsersService.findByPhone(tx, phoneE164): Promise<User | null>`, `UsersService.create(tx, phoneE164): Promise<User>`, and `TokenService.signAccessToken({ userId, sessionId }): Promise<string>`. Task 3 optionally passes an app- or group-invite token to `InviteRedemptionPort`; Tasks 4–6 consume the authenticated user ID from the access-token payload.

- [ ] **Step 1: Validate the authentication environment contract**

Extend `environmentSchema` with these exact values:

```ts
ACCESS_TOKEN_SECRET: z.string().min(32),
ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(86_400).default(2_592_000),
```

Use `new TextEncoder().encode(environment.ACCESS_TOKEN_SECRET)` with `jose` HS256 signing. Add `jose` to `apps/api/package.json`; run `npm install` so `package-lock.json` remains the source of resolved dependency versions.

- [ ] **Step 2: Implement registration and token services**

`UsersService` owns discrete user-record operations. `findByPhone` reads by the already Zod-validated E.164 phone number and `create` inserts an unverified user without setting `phoneVerifiedAt`. `AuthService` owns the registration workflow: it reads first, creates only when absent, and retries the transaction on a phone uniqueness conflict so concurrent registrations safely resolve to the same user without a combined get-or-create method. The later OTP implementation updates the user-verification operation only after proof of phone ownership.

In `TokenService`, implement:

```ts
export type AccessTokenClaims = { userId: string; sessionId: string };
public signAccessToken(claims: AccessTokenClaims): Promise<string>;
public verifyAccessToken(token: string): Promise<AccessTokenClaims>;
```

Map missing/invalid/expired JWTs to `UnauthorizedException("Authentication is required")`, without returning token details.

- [ ] **Step 3: Commit the registration and token primitives**

```bash
git add apps/api/package.json package-lock.json apps/api/src/shared/config/environment.ts apps/api/src/modules/auth
git commit -m "feat: add registration and access tokens"
```

### Task 3: Issue, rotate, and revoke server-side sessions

**Files:**
- Create: `apps/api/src/modules/auth/{session.service.ts,auth.service.ts,auth.controller.ts}`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `UsersService`, `InviteRedemptionPort`, `TokenService`, `PrismaService`, and Task 1 `Session` records.
- Produces: `AuthService.register(input): Promise<AuthResponse>`, `AuthService.refresh(refreshToken): Promise<AuthResponse>`, and `AuthService.logout(sessionId): Promise<void>`. `RegisterInput` is `{ phone: string; inviteToken?: string }`; `AuthResponse` is `{ accessToken: string; refreshToken: string }`. User data is returned only by `GET /v1/user` in Task 4.

- [ ] **Step 1: Implement session persistence and rotation**

Create refresh tokens with `randomBytes(32).toString("base64url")` and hash their UTF-8 value using SHA-256 before storage. `SessionService.create(userId)` must create a session and return the raw refresh token once. `SessionService.rotate(rawToken)` must run a Prisma transaction that:

1. Finds the non-revoked, non-expired row by `tokenHash`.
2. Sets that row's `revokedAt` to `now`.
3. Creates a replacement session with a new hash and expiry.
4. Sets `replacedBySessionId` on the old row.

If a caller presents a previously revoked refresh token, reject it and revoke every non-revoked session for that user to contain token replay.

- [ ] **Step 2: Implement request schemas, service, and controller**

Define Zod schemas in `auth.schemas.ts`:

```ts
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "phone must be E.164");
export const registerSchema = z.object({
  phone: phoneSchema,
  inviteToken: z.string().min(32).optional(),
});
export const refreshSessionSchema = z.object({ refreshToken: z.string().min(32) });
```

Expose the following exact routes; keep tokens in the JSON response for the mobile-client-compatible API, never in logs:

```text
POST /v1/auth/register                { phone, inviteToken? }   -> 201 AuthResponse
POST /v1/auth/refresh                 { refreshToken }          -> 201 AuthResponse
POST /v1/auth/logout                  Authorization: Bearer ... -> 204
```

On registration, open one Prisma transaction; use `UsersService.findByPhone` and `UsersService.create` as separate operations, then if `inviteToken` is present call `InviteRedemptionPort.redeem(tx, inviteToken, user.id)`. Retry the transaction if concurrent user creation receives the phone uniqueness constraint. Create the session in that same transaction. Sign access claims only after it commits. `InviteRedemptionPort` is implemented in Task 6: an `AppInvite` branch marks only the app invite accepted, while a `GroupInvite` branch adds/reactivates membership. The redemption implementation must lock and re-check the pending invite, expiry, hashed token, current account, and group membership inside this transaction: invite creation holds no recipient identity, and the recipient may already have registered before redemption. Do not log phone numbers alongside tokens, and do not create Activity or notification records for ordinary registration.

- [ ] **Step 3: Commit session APIs**

```bash
git add apps/api/src/modules/auth apps/api/src/app.module.ts
git commit -m "feat: add registration sessions"
```

### Task 4: Protect API routes and expose the authenticated user

**Files:**
- Create: `apps/api/src/modules/auth/{auth-user.ts,auth.guard.ts}`
- Create: `apps/api/src/modules/users/users.controller.ts`
- Modify: `apps/api/src/modules/users/{users.module.ts,users.service.ts}`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `TokenService.verifyAccessToken`, `PrismaService`, and `Session` records.
- Produces: `@CurrentUser() user: AuthenticatedUser` and `AuthGuard`, plus `GET /v1/user -> { id, phone, phoneVerified }`. Group controllers in Tasks 5–6 consume `AuthGuard` and `CurrentUser`.

- [ ] **Step 1: Implement session-aware bearer authentication**

Make `AuthGuard` extract exactly one `Authorization: Bearer <token>` value. Verify the JWT, then query its `Session` by `id` and `userId`; reject if it is revoked or expired. Attach this immutable request-local value:

```ts
export type AuthenticatedUser = { id: string; sessionId: string };
```

The `@CurrentUser()` parameter decorator must throw if invoked without the guard-provided user, so unprotected controllers cannot accidentally rely on a forged request property.

- [ ] **Step 2: Implement the users module and route registration**

`UsersService.getAuthenticatedUser(id)` must select only `id`, `phoneE164`, and `phoneVerifiedAt`, throw `UnauthorizedException` if the user no longer exists, and map its response to `{ id, phone, phoneVerified: Boolean(phoneVerifiedAt) }`. Mark only the `/v1/user` controller route with `@UseGuards(AuthGuard)`; do not make authentication global yet, because `/health`, `/ready`, and registration must remain public. Import `AuthModule`, `UsersModule`, and later `GroupsModule` in `AppModule`.

- [ ] **Step 3: Commit authenticated-user support**

```bash
git add apps/api/src/modules/auth apps/api/src/modules/users apps/api/src/app.module.ts
git commit -m "feat: add authenticated user endpoint"
```

### Task 5: Create groups and enforce active-member authorization

**Files:**
- Create: `apps/api/src/modules/groups/{groups.module.ts,groups.controller.ts,groups.service.ts,group-membership.service.ts,groups.schemas.ts}`
- Modify: `apps/api/src/app.module.ts`
- Test: `tests/integration/groups.spec.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `PrismaService`, and Task 1 `GroupMember` records.
- Produces: `GroupsService.create(ownerId, input)`, `GroupMembershipService.requireActiveMember(groupId, userId)`, and `GroupMembershipService.addOrReactivate(groupId, userId)`. Tasks 6 and future expense/list modules consume `requireActiveMember`.

- [ ] **Step 1: Write failing group-create and membership tests**

Append these cases to `tests/integration/groups.spec.ts`:

```ts
it("creates a group and makes its registered creator an active member", async () => {
  const response = await requestAs(registeredUser, { method: "POST", url: "/v1/groups", payload: { name: "Flat 4B" } });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({ name: "Flat 4B", members: [{ userId: registeredUser.id, status: "active" }] });
});

it("rejects access by a user who is not an active group member", async () => {
  const response = await requestAs(outsider, { method: "GET", url: `/v1/groups/${group.id}` });
  expect(response.statusCode).toBe(403);
});
```

Add validation cases: blank/over-80-character group names return `400`; a caller without a valid beta session cannot create a group; and a removed member receives `403` for current group routes.

- [ ] **Step 2: Run the group tests to verify they fail**

Run: `TEST_DATABASE_URL='postgresql://swigsplit:swigsplit@localhost:5432/swigsplit_test' npm run test:integration -- tests/integration/groups.spec.ts`

Expected: FAIL because group routes and membership authorization do not exist.

- [ ] **Step 3: Implement group schemas and membership service**

Use these input schemas:

```ts
export const createGroupSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const groupIdSchema = z.string().uuid();
```

`GroupMembershipService.requireActiveMember` must look up `(groupId, userId)` with `status: ACTIVE` and throw `ForbiddenException("You are not an active member of this group")` otherwise. `GroupsService.create` must require an authenticated registered user and create `Group` and its creator membership in a single Prisma transaction.

- [ ] **Step 4: Implement protected group controllers**

Expose and protect these endpoints:

```text
POST /v1/groups              { name } -> 201 GroupDto
GET  /v1/groups              -> 200 GroupSummaryDto[]
GET  /v1/groups/:groupId     -> 200 GroupDto
```

`GroupDto` should expose `{ id, name, createdAt, members: [{ userId, phone, status, joinedAt, lastJoinedAt }] }`; never expose session/token data. List queries must return only groups where the requester is currently `ACTIVE`.

- [ ] **Step 5: Run the group tests to verify they pass**

Run: `TEST_DATABASE_URL='postgresql://swigsplit:swigsplit@localhost:5432/swigsplit_test' npm run test:integration -- tests/integration/groups.spec.ts`

Expected: PASS. Group creation is atomic and all current-group reads are isolated to active members.

- [ ] **Step 6: Commit group creation and authorization**

```bash
git add apps/api/src/modules/groups apps/api/src/app.module.ts tests/integration/groups.spec.ts
git commit -m "feat: add groups and membership authorization"
```

### Task 6: Implement app invites, group invites, removal, and re-add lifecycle

**Files:**
- Create: `apps/api/src/modules/invitations/{invitations.module.ts,app-invitations.service.ts,invite-redemption.port.ts,invite-token.service.ts}`
- Create: `apps/api/src/modules/groups/group-invitations.service.ts`
- Modify: `apps/api/src/modules/groups/{groups.controller.ts,groups.service.ts,group-membership.service.ts,groups.schemas.ts}`
- Test: `tests/integration/groups.spec.ts`, `tests/integration/auth.spec.ts`

**Interfaces:**
- Consumes: `GroupMembershipService.requireActiveMember`, `GroupMembershipService.addOrReactivate`, authenticated request user, `GroupInvite`, `AppInvite`, and the durable Activity/notification writer.
- Produces: `GroupInvitationsService.invite`, `AppInvitationsService.create`, `InviteRedemptionPort.redeem`, and `GroupsService.removeMember`. Future modules can rely on `GroupMember.status` and `removedAt` history.

- [ ] **Step 1: Write failing invitation and lifecycle tests**

Cover all three invitation flows:

```ts
it("adds an existing user only when they redeem a GroupInvite link", async () => {
  const invite = await requestAs(member, { method: "POST", url: `/v1/groups/${group.id}/invites` });
  const response = await register({ phone: existingUser.phoneE164, inviteToken: tokenFrom(invite) });
  expect(response.statusCode).toBe(201);
  expect(await activeMembership(group.id, existingUser.id)).toBe(true);
});

it("creates a GroupInvite without a recipient phone and joins a newly registered recipient", async () => {
  const invite = await requestAs(member, { method: "POST", url: `/v1/groups/${group.id}/invites` });
  expect(invite.json()).toMatchObject({ kind: "group", signupUrl: expect.stringContaining("/signup?invite=") });
  await register({ phone: "+919876543211", inviteToken: tokenFrom(invite) });
  expect(await activeMembershipForPhone(group.id, "+919876543211")).toBe(true);
});

it("redeems an AppInvite without granting group membership", async () => {
  const invite = await requestAs(member, { method: "POST", url: "/v1/app-invites" });
  await register({ phone: "+919876543212", inviteToken: tokenFrom(invite) });
  expect(await membershipsForPhone("+919876543212")).toHaveLength(0);
});
```

Also cover reactivation, the twenty-first concurrent active addition, membership Activity/notification effects, non-member requests (`403`), expired/reused links (`409`), and the registration race: create a group link, create the target user before redemption, then redeem and assert the transaction safely re-checks the user and membership state rather than inserting a duplicate or bypassing the cap.

- [ ] **Step 2: Run the lifecycle tests to verify they fail**

Run: `TEST_DATABASE_URL='postgresql://swigsplit:swigsplit@localhost:5432/swigsplit_test' npm run test:integration -- tests/integration/groups.spec.ts tests/integration/auth.spec.ts`

Expected: FAIL because bearer-link creation, separate invite models, invite redemption, removal, re-add, effects, and capacity flows do not exist.

- [ ] **Step 3: Implement locked capacity checks and membership transitions**

Inside `addOrReactivate`, execute a serializable `$transaction`; first acquire a group row lock using a parameterized Prisma raw query:

```ts
await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
const activeCount = await tx.groupMember.count({ where: { groupId, status: "ACTIVE" } });
if (activeCount >= 20) throw new ConflictException("This group already has 20 active members");
```

Then either create the membership or update its existing row to `{ status: "ACTIVE", removedAt: null, lastJoinedAt: now }`. Do not insert another history row. Group membership is added only during `GroupInvite` redemption, where the appropriate membership Activity/notification effects are created atomically. `removeMember` must update only an active membership to `{ status: "REMOVED", removedAt: now }`; it must reject attempts to remove a non-active member and must not delete rows.

- [ ] **Step 4: Implement separate invitation creation and redemption**

Invite creation accepts no recipient identifier. Pending invitations expire after seven days. `InviteTokenService` generates `randomBytes(32).toString("base64url")` values and stores only their SHA-256 hashes. It is shared by both invitation kinds but never decides permissions.

For `POST /v1/groups/:groupId/invites`, confirm the caller is active, create a `GroupInvite`, and return `signupUrl: ${APP_WEB_URL}/signup?invite=<raw token>`. The request accepts no recipient phone/email and does not change membership. For `POST /v1/app-invites`, create an `AppInvite` and return the same kind of opaque signup URL; the record has no group, recipient identity, or membership effect.

Expose these protected endpoints:

```text
POST   /v1/groups/:groupId/invites                  -> 201 GroupInviteDto
POST   /v1/app-invites                              -> 201 AppInviteDto
DELETE /v1/groups/:groupId/members/:userId        -> 204
```

`InviteRedemptionPort.redeem` runs inside the registration transaction. It locks and re-checks the matching `AppInvite` or `GroupInvite`, its `PENDING` status, expiry, and SHA-256 token hash after the user account has been obtained. For a `GroupInvite`, it additionally locks the group, re-checks the current membership, invokes `addOrReactivate`, accepts the redeemed invite, and creates membership Activity/notification effects atomically. This handles the race where the recipient already registered after link creation but before redemption. For an `AppInvite`, it marks only that app invite accepted; it must never read or write group membership. Expired, cancelled, accepted, or replayed links return `409`.

- [ ] **Step 5: Run lifecycle and concurrency tests to verify they pass**

Run: `TEST_DATABASE_URL='postgresql://swigsplit:swigsplit@localhost:5432/swigsplit_test' npm run test:integration -- tests/integration/groups.spec.ts tests/integration/auth.spec.ts`

Expected: PASS. Existing and new users join only by redeeming a group link; app-only links create no membership; membership effects are durable; and concurrent additions never exceed 20 active members.

- [ ] **Step 6: Commit invitation and membership lifecycle behavior**

```bash
git add apps/api/src/modules/groups apps/api/src/modules/invitations tests/integration/{auth,groups}.spec.ts
git commit -m "feat: add app and group invitation lifecycle"
```

### Task 7: Validate the complete milestone and document configuration

**Files:**
- Modify: `.env.example` (create it if absent)
- Modify: `README.md` (create it if absent)
- Modify: `docs/swigsplit-backend-architecture.md` only if actual endpoint names differ from its API conventions
- Test: `tests/integration/{auth,groups,health}.spec.ts`

**Interfaces:**
- Consumes: All completed Task 2 modules.
- Produces: A reproducible local-test setup and a verified Task 2 acceptance baseline for the financial milestone.

- [ ] **Step 1: Document safe local setup and API contract**

Create `.env.example` with non-secret placeholders for `DATABASE_URL`, `REDIS_URL`, `TEST_DATABASE_URL`, `CORS_ORIGINS`, `APP_WEB_URL`, `ACCESS_TOKEN_SECRET`, and the session TTL variables. Add README commands for:

```bash
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm test
```

Document that private-beta registration accepts an E.164 phone number without proof of ownership and will gain OTP verification after the beta. Document the auth routes, the E.164 requirement, invite signup-link flow, 20-member cap, and the need to set an independent `TEST_DATABASE_URL`.

- [ ] **Step 2: Run focused integration suites**
Run: `TEST_DATABASE_URL='postgresql://swigsplit:swigsplit@localhost:5432/swigsplit_test' npm run test:integration -- tests/integration/health.spec.ts tests/integration/auth.spec.ts tests/integration/groups.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run the build and schema checks**

Run: `npm run prisma:generate && npm run build && npm test`

Expected: PASS. TypeScript builds both API and worker; all current test suites pass.

- [ ] **Step 4: Review the diff for security invariants**

Run: `git diff --check && rg -n "console\.log|accessToken|refreshToken|otp" apps/api/src`

Expected: `git diff --check` reports no whitespace errors. Inspect matches to confirm tokens and codes are neither logged nor surfaced except as the two intentional authentication response fields.

- [ ] **Step 5: Commit milestone documentation and verification**

```bash
git add .env.example README.md docs/swigsplit-backend-architecture.md tests apps/api/src
git commit -m "docs: document verified identity and groups"
```

## Coverage review

- No-OTP registration, access-token validation, refresh rotation, and logout: Tasks 2–4. OTP verification is deferred until after private beta.
- `GET /v1/user` and authenticated route behavior: Task 4.
- Group creation, active-member visibility, and authorization isolation: Task 5.
- Bearer signup links, app/group redemption boundaries, removal, re-add, historical membership preservation, and the 20-member concurrency limit: Task 6.
- Configuration, build, test, and no-secret-log verification: Task 7.

## Self-review

- **Spec coverage:** All Task 2 responsibilities from the approved backend plan are mapped to Tasks 1–7. The design’s removed-member historical-access constraint is preserved in the schema; enforcement of record-level historical access begins with expense/activity modules in the next milestone because those records do not exist yet.
- **Intentional scope boundary:** SMS-provider delivery is represented only as an OTP delivery adapter boundary. Selecting and integrating a production provider requires a separate credential and vendor decision, so this plan does not invent one.
- **Placeholder scan:** No unresolved placeholders or unspecified error-handling steps remain.
- **Type consistency:** All later tasks use `AuthenticatedUser`, `AuthResponse`, `GroupMembershipService.requireActiveMember`, and `GroupMembershipService.addOrReactivate` exactly as defined above.
