# SwigSplit backend

The SwigSplit backend is the shared API for web, iOS, and Android clients. It owns authentication, groups, invitations, and future expense and payment logic.

## Local setup

```bash
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
```

Update `.env` before starting the API. `APP_WEB_URL` must be an HTTPS origin because it is used to build invite signup links. `ACCESS_TOKEN_SECRET` must be an independent, random value of at least 32 characters.

Start the API and the delayed-job worker in separate terminals:

```bash
npm run dev
npm run start:worker
```

The worker processes delayed group-deletion jobs after the 30-day restoration period.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the API and worker. |
| `TEST_DATABASE_URL` | Separate PostgreSQL database reserved for database-backed tests. |
| `REDIS_URL` | Redis connection used for queues and delayed jobs. |
| `CORS_ORIGINS` | Allowed browser origins. |
| `APP_WEB_URL` | HTTPS client origin used in returned invite signup URLs. |
| `ACCESS_TOKEN_SECRET` | Secret used to sign access tokens; never commit a real value. |
| `ACCESS_TOKEN_TTL_SECONDS` | Access-token lifetime, from 60 to 900 seconds. |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh-session lifetime, from one to thirty days. |

## Current API behavior

Registration accepts an E.164 phone number during the private beta. It creates an unverified account; OTP verification is not implemented yet.

```text
POST /v1/auth/register       { phone, inviteToken? }
POST /v1/auth/refresh        { refreshToken }
POST /v1/auth/logout         Authorization: Bearer <access token>
GET  /v1/user                Authorization: Bearer <access token>
```

Registration only accepts a new phone number. A user who already has an account must use an existing authenticated session rather than registering again.

Authenticated group endpoints:

```text
POST   /v1/groups                           { name }
GET    /v1/groups
GET    /v1/groups/:groupId
PATCH  /v1/groups/:groupId                  { name }
DELETE /v1/groups/:groupId                  archive for 30 days
POST   /v1/groups/:groupId/restore
DELETE /v1/groups/:groupId/permanently
DELETE /v1/groups/:groupId/members/:userId
```

Any active group member can manage these group operations. A group has at most 20 active members.

Invitation endpoints require authentication:

```text
POST /v1/groups/:groupId/invites
POST /v1/app-invites
POST /v1/invites/redeem                     { inviteToken }
```

Group and app invites are opaque one-time links with a seven-day expiry. Group links add or reactivate a membership only when they are redeemed; app links never create a group membership. The API returns a signup URL, while web and mobile clients are responsible for navigation after a link is opened.

## Checks

```bash
npm test
npm run build
```

Keep `TEST_DATABASE_URL` independent from `DATABASE_URL` when database-backed tests are added.
