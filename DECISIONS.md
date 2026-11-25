# Decisions

## What I built
- **Login**: OIDC authorization code + PKCE on the server. state, nonce and verifier live in Redis (one-time GETDEL), so
  any instance can finish a login. The id_token is verified against the IdP's JWKS (iss, aud, exp, nonce). Sessions are
  opaque ids in Redis (only their SHA-256 stored). The cookie is httpOnly, SameSite=Lax, and Secure off localhost.
  `requireSession` + `requireWorkspaceMember` guard every `/api` route and the `/ws` upgrade.
- **Inbound webhooks**: HMAC over the raw bytes, then the timestamp check (5 min), then parse. Stored idempotently through
  unique indexes before the 2xx. Every step is idempotent, so Pigeon's retry repairs a crash between steps.
- **Replies**: the reply and its send job are one Mongo insert (outbox as fields, no transaction), unique on `client_ref`.
  Every instance runs a worker that leases due jobs (`outboxDueAt` is also the lease expiry) and sends with
  `Idempotency-Key = client_ref`. A Redis token bucket and a Retry-After cool-off are shared by all instances. A 503
  pauses the workspace. A timeout is retried soon and answered from Pigeon's idempotency cache.
- **Claims**: one conditional `findOneAndUpdate({assignee: null})`, so six concurrent claims give one winner.
- **Realtime**: one Redis Stream per workspace. A Lua script does dedupe + INCR + XADD atomically, and the entry id is the
  seq, so seq order holds across instances. `/ws?after=N` replays with XRANGE, then goes live (blocking XREAD per instance).
- **Frontend**: login, workspace switcher, inbox with filters and pagination, thread, claim/release/close/reopen, and replies
  that are idempotent and appear instantly with live status. Reconnect with `after=lastSeq`.

## Check results (this machine)
`CHECK_REPORT.json` covers **levels 1 and 5: 39 / 39**, run on Windows with `SB_LB_PORT=4100`. My dev server was still
running on :4000 (where Pigeon delivers webhooks), with the same code and the same MongoDB/Redis. It acted as an extra
instance that received the webhooks. **Levels 2 and 3 were not run here**: on native Windows the harness's
`process.kill(-pid)` cannot kill the server, so those results would be meaningless. They should run under Linux, WSL or
the devcontainer.

## Cut, and why
End-to-end encrypted notes, Elasticsearch search, and billing were cut. I spent the time on the five check levels and on the
correctness the brief stresses (exactly-once, ordering, isolation).

## Assumptions where the brief is silent
- A new inbound message reopens a closed conversation. A late *duplicate* does not.
- Agents cannot reply in, release, or close a conversation another agent holds (409). Admins can, and "claim" by an admin
  takes over.
- Sends are never abandoned except on a 4xx other than 429 ("a reply must not be lost"). Backoff is capped at 5 s.
- Unknown workspace, unknown event type, unknown status value, or a status for a message we never sent: 2xx and ignored.
  JSON that is valid but lacks required fields for a known type: 400.
- `GET /api/conversations` defaults to the `open` filter.

## What I know is still wrong or unproven
- **Levels 2 and 3 are unverified on a real kill.** Failover relies on the lease (20 s), so replies held by a dead instance wait
  up to 20 s. That is inside the 60 s window, but not tested here.
- **The realtime log lives in Redis.** If Redis restarted without persistence, seq would restart and open sockets would wait
  for ids they have already passed, until the client reloads. Messages are never lost; they are in Mongo.
- A retried reply can overtake a later reply to the same contact (the outbox is not ordered per conversation).
- The replay window is ~10k events per workspace, and dedupe markers last 24 h. A client further behind should refetch,
  and the UI only does that on a cold start.
- I have not clicked through the frontend by hand against the final API. It typechecks, its unit tests pass, and its API
  shapes match the server DTOs, but there is no browser test.
