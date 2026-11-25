# Switchboard — architecture

Express + TypeScript server (`scaffold/server`), Vite + React web (`scaffold/web`), MongoDB, Redis, zod.

---

## 0. Architecture review (v1 → v2)

| # | Problem in v1 | Change in v2 |
|---|---|---|
| 1 | Route files mixed HTTP parsing, auth, business rules and DB calls | Layers: **routes → middleware → controllers → services → repositories**, plus `utils/` and `constants/` |
| 2 | Every handler had its own ad-hoc response shape | One **response envelope** and one `respond` util. Messages come from a single **message catalog** (`constants/messages.ts`) keyed by code |
| 3 | Errors handled per handler; risk of leaking stack traces or returning 5xx where Pigeon requires 4xx | Typed `AppError(code)` plus one central **error middleware**. A zod error becomes `400 VALIDATION_FAILED`; an unknown error becomes `500 INTERNAL_ERROR` with a requestId and no stack |
| 4 | Config read with fallbacks and never validated | `config/env.ts` parses `process.env` with zod at boot and fails fast with a clear message |
| 5 | Mongo queries spread across modules | `repositories/` own collections and indexes. Services never touch the driver directly |
| 6 | Grader endpoints risked duplicating logic | Grader controllers call the **same services** as the UI controllers (required by contract D) |
| 7 | No request tracing across instances | `requestId` middleware plus a small structured logger with `instance` id. The outbox lease owner uses the same id |
| 8 | No shutdown handling | On SIGTERM: stop accepting connections, stop the worker loop, release leases. kill -9 is still covered by lease expiry |
| 9 | **Fixed contract shapes would break if wrapped** | Contract routes (`/api/me`, `/__grader/*`, webhook, `/ws` frames, `/healthz`) **bypass the envelope** and return the exact shape the check expects. Everything else uses the envelope |

Over-engineering guard (90-minute budget): no DI container, no class hierarchies, no ORM. Plain modules and functions, one file per concern.

---

## 1. Request flow

```
HTTP request
  → requestId → logger → (cors/cookies) → route
  → middleware:  requireSession → requireMember(ws) → requireRole('admin'?) → validate(zodSchema)
  → controller:  reads req, calls service, calls respond.ok(res, CODE, data)
  → service:     business rules, transactions-by-unique-index, emits domain events
  → repository:  Mongo / Redis access only
  ← errors thrown as AppError(CODE) → errorHandler → respond.fail(res, CODE, details)
```

```
Pigeon --webhook--> webhook.controller --> inbound.service --> repos (messages, conversations)
                                                         \--> event.service --> events repo + Redis PUBLISH sb:ws:<ws>
Browser <--/ws-- realtime gateway (each instance SUBSCRIBEs; replay from events repo)

Agent reply --> conversation.controller / grader.controller --> reply.service --> messages repo (outbox row)
            --> outbox.worker (lease) --> rateLimit util (Redis) --> pigeon.client --> Pigeon /v1/messages
```

---

## 2. API response format (dynamic, catalog-driven)

### Envelope (all non-contract routes)

```jsonc
// success
{ "success": true,  "code": "CONVERSATION_CLAIMED", "message": "Conversation claimed.",
  "data": { ... }, "meta": { "nextCursor": "..." }, "requestId": "req_..." }

// failure
{ "success": false, "code": "CONVERSATION_TAKEN", "message": "Another agent already holds this conversation.",
  "errors": [ { "path": "contact", "message": "Required" } ], "requestId": "req_..." }
```

### Message catalog: `constants/messages.ts`

Each code has its HTTP status and default message in one place. Controllers and services refer to codes only, never to raw strings or status numbers.

```ts
export const MSG = {
  // success
  OK:                    { status: 200, message: 'OK.' },
  CONVERSATIONS_LISTED:  { status: 200, message: 'Conversations fetched.' },
  MESSAGES_LISTED:       { status: 200, message: 'Messages fetched.' },
  REPLY_QUEUED:          { status: 202, message: 'Reply queued for delivery.' },
  CONVERSATION_CLAIMED:  { status: 200, message: 'Conversation claimed.' },
  CONVERSATION_RELEASED: { status: 200, message: 'Conversation released.' },
  CONVERSATION_CLOSED:   { status: 200, message: 'Conversation closed.' },
  CONVERSATION_REOPENED: { status: 200, message: 'Conversation reopened.' },
  // client errors
  VALIDATION_FAILED:     { status: 400, message: 'Request is invalid.' },
  UNAUTHENTICATED:       { status: 401, message: 'Sign in required.' },
  FORBIDDEN_WORKSPACE:   { status: 403, message: 'You are not a member of this workspace.' },
  FORBIDDEN_ROLE:        { status: 403, message: 'Your role does not allow this action.' },
  WORKSPACE_NOT_FOUND:   { status: 404, message: 'Workspace not found.' },
  CONVERSATION_NOT_FOUND:{ status: 404, message: 'Conversation not found.' },
  CONVERSATION_TAKEN:    { status: 409, message: 'Another agent already holds this conversation.' },
  // webhook
  WEBHOOK_BAD_SIGNATURE: { status: 401, message: 'Invalid signature.' },
  WEBHOOK_STALE:         { status: 401, message: 'Timestamp too old.' },
  WEBHOOK_BAD_BODY:      { status: 400, message: 'Body could not be parsed.' },
  // server
  INTERNAL_ERROR:        { status: 500, message: 'Something went wrong.' },
} as const;
export type MsgCode = keyof typeof MSG;
```

### Utilities

```ts
// utils/AppError.ts
class AppError extends Error { constructor(public code: MsgCode, public details?: unknown, message?: string) }

// utils/respond.ts
respond.ok(res, code: MsgCode, data?, meta?)      // envelope success, status from catalog
respond.fail(res, code: MsgCode, errors?)         // envelope failure
respond.raw(res, status, body)                    // contract routes: exact shape, no envelope

// utils/asyncHandler.ts: wraps async controllers so rejections reach errorHandler
```

### Contract routes (raw, no envelope; shapes fixed by BRIEF.md)

| Route | Body |
|---|---|
| `GET /healthz` | `{ ok: true }` |
| `GET /api/me` | `{ sub, workspaces: [{ id, role }] }` (the check reads `me.sub` directly) |
| `/__grader/*` | snapshot shape from BRIEF; others only need the status code |
| `POST /webhooks/pigeon` | `{ ok: true }` with the status from the PIGEON.md table |
| `/ws` frames | `{ seq, type, contact, ... }` |

`GET /api/conversations` may use any shape, so it **does** use the envelope (`data.items`, `meta.nextCursor`). The check looks only at its status code.

---

## 3. Server module layout

```
scaffold/server/src/
  index.ts                     bootstrap: env → db/redis → indexes → worker → http + ws → mark ready; SIGTERM
  app.ts                       builds the Express app: middleware order, routers, 404, errorHandler

  config/
    env.ts                     zod-validated env (PORT, URLs, secrets, pigeon keys map)
    constants.ts               timeouts, lease ms, rate-limit numbers, status ranks

  constants/
    messages.ts                MSG catalog (code → status + message)
    roles.ts                   Role = 'admin' | 'agent'; permissions map

  infra/
    mongo.ts                   client + getDb()
    redis.ts                   command client + separate subscriber client
    logger.ts                  JSON logger with instanceId, requestId

  middleware/
    requestId.ts
    requireSession.ts          cookie → Redis session → req.user  (401)
    requireMember.ts           ?workspace= / :workspace ∈ req.user.workspaces  (403)
    requireRole.ts             requireRole('admin')  (403)
    requireGraderToken.ts      x-grader-token  (401)
    validate.ts                validate({ body?, query?, params? }) with zod, typed req
    rawBody.ts                 express.raw for the webhook route only
    errorHandler.ts            AppError | ZodError | unknown → respond.fail
    notFound.ts

  validators/                  zod schemas (one file per area)
    webhook.schema.ts  conversation.schema.ts  grader.schema.ts  auth.schema.ts

  routes/
    index.ts                   mounts all routers
    health.routes.ts  auth.routes.ts  me.routes.ts  conversation.routes.ts
    webhook.routes.ts  grader.routes.ts

  controllers/                 thin: read req → call service → respond.*
    auth.controller.ts  me.controller.ts  conversation.controller.ts
    webhook.controller.ts  grader.controller.ts

  services/                    business rules; no req/res
    auth.service.ts            OIDC: PKCE, state/nonce in Redis, code exchange, id_token verify (jose)
    session.service.ts         create / read / destroy session
    inbound.service.ts         idempotent ingest of message.inbound
    status.service.ts          forward-only status updates
    conversation.service.ts    list, ensure, claim, release, close, reopen
    reply.service.ts           create outbound + outbox row (idempotent on client_ref)
    event.service.ts           nextSeq → insert event (dedupeKey) → publish
    snapshot.service.ts        grader snapshot
    reset.service.ts           wipe app collections + sb:rl:*, sb:cool:*

  repositories/                only layer that touches Mongo collections
    conversation.repo.ts  message.repo.ts  event.repo.ts  counter.repo.ts
    indexes.ts                 ensureIndexes() at boot

  integrations/
    pigeon.client.ts           POST /v1/messages, timeout, classifies 2xx / 429 / 503 / timeout / 4xx

  workers/
    outbox.worker.ts           lease → rate limit → send → record → release; recovers expired leases

  realtime/
    ws.gateway.ts              upgrade auth (session + membership), after= replay, live fan-out
    pubsub.ts                  Redis SUBSCRIBE sb:ws:* → local sockets; per-socket lastSeq + gap fill

  utils/
    AppError.ts  respond.ts  asyncHandler.ts
    hmac.ts                    verifyPigeonSignature(raw, header, secret, now)   (pure, tested)
    statusRank.ts              canTransition(from, to)                           (pure, tested)
    rateLimit.ts               Redis Lua token bucket + cool-off key
    cursor.ts                  encode/decode pagination cursor (lastActivityAt + _id)
    pkce.ts  ids.ts  time.ts

  types/
    express.d.ts               req.user, req.requestId
    domain.ts                  Conversation, Message, Event, Session types

  test/
    hmac.test.ts  statusRank.test.ts  claim.race.test.ts
```

Dependency rule: `routes → middleware/controllers → services → repositories/integrations → infra`.
`utils/` and `constants/` can be imported from anywhere. Nothing imports upward.

---

## 4. Web module layout

> Superseded by **[FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)** (feature folders, TanStack Query, realtime
> cache patching, idempotent replies). The sketch below is kept for history.

```
scaffold/web/src/
  main.tsx  App.tsx
  api/
    client.ts                  fetch wrapper: credentials, parses envelope, throws ApiError(code, message)
    endpoints.ts               me(), listConversations(ws, cursor), messages(), reply(), claim(), ...
  hooks/
    useSession.ts  useSocket.ts (reconnect with after=lastSeq, backoff)  useInbox.ts
  context/
    SessionContext.tsx  WorkspaceContext.tsx
  components/
    WorkspacePicker.tsx  InboxList.tsx  Thread.tsx  Composer.tsx  StatusBadge.tsx  Toast.tsx
  pages/
    LoginPage.tsx  InboxPage.tsx
  constants/messages.ts        UI text; server `message` shown as a fallback
```

---

## 5. MongoDB collections

| Collection | Fields | Indexes |
|---|---|---|
| `conversations` | `workspace, contact, assignee \| null, state: open \| closed, lastActivityAt, createdAt, updatedAt` | unique `{workspace, contact}`; `{workspace, lastActivityAt: -1, _id: -1}` |
| `messages` | `workspace, contact, dir: in \| out, providerId, clientRef, text, occurredAt, status, statusRank, authorSub`; outbox: `sendState: pending \| inflight \| done, attempts, nextAttemptAt, leaseOwner, leaseUntil, lastError` | unique partial `{workspace, providerId}` (dir=in); unique partial `{workspace, clientRef}` (dir=out); `{workspace, contact, occurredAt, _id}`; `{sendState, nextAttemptAt}` |
| `events` | `workspace, seq, type, dedupeKey, payload, at` | unique `{workspace, seq}`; unique `{workspace, dedupeKey}` |
| `counters` | `_id: "seq:<workspace>", value` | `_id` |

Rules:
- Idempotency comes from unique indexes. A duplicate-key error means "already stored", so the server still answers 2xx.
- Status is forward-only: `queued 0 → sent 1 → delivered | failed 2`, updated with filter `statusRank < newRank`.
- Claim: ensure the conversation exists (upsert, retry once on E11000), then a conditional
  `findOneAndUpdate({workspace, contact, assignee: {$in: [null, agent]}})`. No match → `CONVERSATION_TAKEN` (409).
- Snapshot `inbound` is sorted by `occurredAt`, then `providerId`.

## 6. Redis keys (prefix `sb:`)

| Key | Purpose | Cleared by reset |
|---|---|---|
| `sb:sess:<id>` | Session `{sub, workspaces}`, TTL 8 h | no |
| `sb:oidc:<state>` | `{verifier, nonce, returnTo}`, TTL 10 min | no |
| `sb:rl:<ws>` | Per-workspace token bucket (Lua; ~3.5/s, burst 8) | yes |
| `sb:cool:<ws>` | Retry-After / 503 cool-off, PX = wait | yes |
| `sb:ws:<ws>` | Pub/sub channel for realtime fan-out | n/a |

Reset deletes the app collections and uses `SCAN`+`DEL` on `sb:rl:*` and `sb:cool:*`. It never runs `FLUSHDB`.

## 7. Durability

- Webhook: return 2xx only after the Mongo write. Bad signature or stale timestamp → 401, bad body → 400, never a 5xx.
  A 5xx is allowed only when storage is unavailable, so that Pigeon retries.
- Event append is keyed by `dedupeKey` (`in:<message_id>`, `st:<client_ref>:<status>`, `as:<contact>:<assignee>:<ts>`),
  so a webhook retried after a crash cannot lose or double a frame.
- Reply: return `202` only after the outbox row is inserted. The worker leases rows (`leaseUntil = now + 30 s`, longer than the
  15 s fetch timeout). If the instance dies, the lease expires and another instance takes the row. `Idempotency-Key = client_ref`
  makes resending safe.

## 8. Security notes

- Session cookie `httpOnly; SameSite=Lax; Path=/` (plus `Secure` outside localhost). The session id is 32 random bytes.
- `timingSafeEqual` for the webhook HMAC and the grader token.
- No secrets in logs. Error responses never include stack traces.
- Every service query is scoped by `workspace` taken from `requireMember`, never from client data alone.
