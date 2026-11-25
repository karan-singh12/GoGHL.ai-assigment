# Switchboard — execution plan (90 minutes)

Order of work follows the brief: level 1 → 5 → 2 → 3, then UI. Commit at the end of every phase (≤ 15 min apart).

## Findings from `harness/check.js` that shape the plan

- Instances are started with `sh -c` and killed with `process.kill(-pid, SIGKILL)`. On native Windows that
  kill fails, so run `npm run check:full` in WSL / the devcontainer / Codespaces for real level 2/3 results.
- Inbound order is graded against `occurred_at`, so the snapshot sorts by `occurredAt`, not arrival.
- The OIDC callback can land on a different instance than `/auth/login`, so the PKCE verifier, state and nonce live in
  Redis. The `workspaces` claim is in the RS256 `id_token` (verify with JWKS via `jose`).
- Pigeon reports: sends without `Idempotency-Key`, sends inside a Retry-After window (per workspace, across
  all instances), and request volume during outages (stay ≤ ~6 req/s).
- `/healthz` must return 200 only when the server is ready (Mongo + Redis + indexes).

## Phases

| Phase | Time | Work | Done when |
|---|---|---|---|
| **P0 Setup** | 0–10 | `git init`, `npm run up`, `npm run doctor`, `npm run scaffold:install`, add `zod`, `ws`, `jose`. Create the layered skeleton from `ARCHITECTURE.md`: `config/env.ts`, `constants/messages.ts`, `utils/{AppError,respond,asyncHandler}`, `middleware/{requestId,errorHandler,validate,notFound}`, `app.ts`, `repositories/indexes.ts`; healthz after ready. | Doctor all PASS, skeleton boots, first commit |
| **P1 Core (L1)** | 8–30 | Webhook: raw-body HMAC verify → timestamp ≤ 5 min → zod parse → idempotent store → 2xx. Grader `reset` / `snapshot` / `reply` / `claim`. Replies persisted first (outbox); worker sends with `Idempotency-Key = client_ref`, backoff, Retry-After. Forward-only status. Atomic claim. | `npm run check` ≈ 24/24 |
| **P2 Auth + realtime (L5)** | 30–48 | OIDC code + PKCE, Redis sessions, httpOnly cookie. `/api/me`, `/api/conversations` (401/403). `/ws` auth on upgrade; every change → `seq` (Mongo counter) → `events` → Redis pub/sub fan-out; `after=` replay. | `npm run check -- --levels 5` passes |
| **P3 Survive (L2/L3)** | 48–62 | Leased outbox jobs (`leaseUntil`), stale-lease recovery by any instance; Redis per-workspace token bucket + cool-off key; short pause on 503. | `check:full` L2/L3 pass (WSL/container) |
| **P4 Frontend** ✅ built early (see `FRONTEND_ARCHITECTURE.md`); remaining: wire to real API once designed | 62–78 | React: login, workspace picker, inbox (newest first, paginated), thread, composer with status badges, claim / close / reopen; socket reconnects with `after=lastSeq`. | Usable in browser |
| **P5 Ship** | 78–90 | 2–3 tests, `README.md`, `DECISIONS.md`, `npm run check:full` → `CHECK_REPORT.json`, export `ai-logs/`, push, make public. | Submitted |

## Roles

- `agent`: claim an unassigned conversation, reply, close/reopen conversations they hold.
- `admin`: everything an agent can do, plus unassign / reassign anyone's conversation.
- Grader endpoints bypass roles but call the same domain functions (opaque `agent` id).

## Cut list (record in `DECISIONS.md`)

- End-to-end encrypted notes (`PROTOCOL.md`)
- Elasticsearch search
- Paybox billing bonus
