# SwigSplit API

## Purpose

`swigsplit-backend` is the single, unified backend used by the web, iOS, and Android clients. It exposes a versioned HTTPS API and is the source of truth for its API contract.

## Responsibilities

- Enforce authentication, verified-phone identity, group membership, and permissions.
- Own and persist groups, expenses, exact shares, payments, lists, draft carts, notifications, Activity, and Instamart order links.
- Validate every financial mutation and calculate balances from expense shares and payment records. Clients must never be trusted to calculate or mutate balances.
- Apply expense edits, soft deletes, payments, audit history, Activity events, and notifications atomically.
- Publish and enforce the versioned API contract consumed by all clients. Contract changes must preserve compatibility or be introduced through a new API version.
- Keep Swiggy OAuth tokens and all Instamart integration details server-side; never expose access tokens to a client.

## Boundaries

- Do not import source code from `swigsplit-web`, `swigsplit-ios`, or `swigsplit-android`.
- Do not place frontend presentation logic here.
- Do not duplicate financial or permission rules in clients; clients request actions through this API.
- All monetary amounts are stored and processed as integer paise.

## Build policy

- Do not run incremental builds or any build command. The user runs builds.

## Reference

Read `../docs/2026-08-31-swigsplit-design.md` before implementing product behaviour.
