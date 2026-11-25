# Switchboard — database schema (MongoDB 7 + Redis)

Design goals, in priority order:

1. **Correct under at-least-once, out-of-order and concurrent writes.** Unique indexes are what make writes idempotent. We never "check then insert".
2. **Crash-safe without multi-document transactions.** Each business fact that must be atomic lives in **one document**,
   for example a reply and its outbox job.
3. **Tenant isolation by construction.** Every collection key starts with `workspace`, and every repository function takes
   `workspace` as its first argument.
4. **Every hot query hits an index.** The inbox list, the thread, the outbox poll, socket replay and the snapshot.

No collection for workspaces or users: workspaces come from config (`PIGEON_KEY_WS_*`) and users/roles from the IdP's
`workspaces` claim. Sessions live in Redis.

---

## 1. `conversations` — one per (workspace, contact)

```ts
{
  _id: ObjectId,
  workspace: 'ws_acme',
  contact: '+14155550101',          // E.164, as Pigeon sends it
  state: 'open' | 'closed',
  assignee: 'u_ben' | null,         // opaque agent id (IdP sub, or grader's agent string)
  assignedAt: Date | null,
  lastActivityAt: Date,             // max(occurredAt) of its messages: inbox sort key
  lastMessage: { text, dir: 'in'|'out', at: Date } | null,   // denormalised preview for the list
  createdAt: Date,
  updatedAt: Date,
}
```

| Index | Why |
|---|---|
| `{workspace:1, contact:1}` **unique** | One conversation per contact. Concurrent creates collide here (E11000), so we retry once and the second create becomes an update. |
| `{workspace:1, lastActivityAt:-1, _id:-1}` | Inbox "all", newest first, keyset pagination. |
| `{workspace:1, state:1, lastActivityAt:-1, _id:-1}` | Inbox "open" / "closed". |
| `{workspace:1, assignee:1, lastActivityAt:-1, _id:-1}` | Inbox "mine". |

Write rules:
- **Activity** is one pipeline update with upsert. `lastActivityAt = $max(old, at)`, and `lastMessage` changes only if `at >= old`.
  A late, out-of-order webhook therefore never moves the conversation backwards or replaces the preview.
- **New inbound reopens** a closed conversation (customer wrote again). This is an assumption, recorded in DECISIONS.md.
- **Claim** is a conditional update: `findOneAndUpdate({workspace, contact, assignee: null}, {$set: {assignee}})`.
  If nothing matches, we read the current holder. The same agent gets `already` (200), anyone else gets `taken` (409).
  MongoDB applies single-document updates atomically, so six simultaneous claims produce exactly one winner.
- **Admin take-over / release** are unconditional `$set`. The permission check happens in the service.

## 2. `messages` — inbound and outbound, and the outbox

```ts
{
  _id: ObjectId,
  workspace, contact,
  dir: 'in' | 'out',
  text: string,
  occurredAt: Date,                 // in: Pigeon occurred_at · out: when the agent sent it
  createdAt: Date,                  // when we stored it
  providerMessageId: string | null, // in: pmsg_… (dedupe key) · out: pm_… once Pigeon accepts

  // ---- inbound only
  eventId?: string,                 // Pigeon evt_…, for debugging

  // ---- outbound only
  clientRef?: string,               // idempotency key: ours, the grader's, or the browser's
  authorSub?: string | null,        // agent who wrote it (null for grader replies)
  status?: 'queued' | 'sent' | 'delivered' | 'failed',
  statusRank?: 0 | 1 | 2,           // queued 0 < sent 1 < delivered|failed 2
  statusAt?: Date,

  // ---- outbox (present only while a send is still owed)
  outboxDueAt?: Date,               // next time a worker may try; also acts as the lease expiry
  outboxOwner?: string | null,      // instanceId holding the lease
  sendAttempts?: number,
  lastSendError?: string | null,
  acceptedAt?: Date,                // Pigeon answered 2xx
}
```

| Index | Why |
|---|---|
| `{workspace:1, providerMessageId:1}` **unique**, partial `dir:'in'` | Duplicate or replayed inbound webhooks cannot create a second row. |
| `{workspace:1, clientRef:1}` **unique**, partial `dir:'out'` | The same `client_ref` asked twice, even at the same instant, is one reply. |
| `{workspace:1, contact:1, occurredAt:1, _id:1}` | Thread view (keyset, both directions) and the snapshot's `inbound` order. |
| `{outboxDueAt:1}` partial `outboxDueAt exists` | The worker poll touches only rows that still owe a send, so the index stays tiny. |

### Why the outbox is a field, not a collection
The reply and its send job are written in **one insert**, so there's no window where a reply exists without a job (or the reverse). It needs no transaction.

### Outbox lease (`outboxDueAt` is both "retry at" and "lease until")
```
claim:    findOneAndUpdate({ outboxDueAt: {$lte: now} },
                           { $set: { outboxDueAt: now + leaseMs, outboxOwner: me }, $inc: { sendAttempts: 1 } },
                           { sort: { outboxDueAt: 1 } })
success:  updateOne({ _id, outboxOwner: me }, { $unset: { outboxDueAt, outboxOwner }, $set: { acceptedAt, providerMessageId } })
retry:    updateOne({ _id, outboxOwner: me }, { $set: { outboxDueAt: now + backoff, outboxOwner: null, lastSendError } })
fatal 4xx:updateOne({ _id, outboxOwner: me }, { $unset: outbox fields, $set: { status: 'failed', statusRank: 2 } })
```
- An instance killed mid-send leaves `outboxDueAt = now + leaseMs`. Once that passes, any instance claims the row again.
- A resend after a crash is safe, because Pigeon dedupes on `Idempotency-Key = clientRef`.
- Every completion is guarded by `outboxOwner: me`, so a worker whose lease was taken over cannot overwrite the new owner.
- Retries never stop except on a 4xx that is not 429. Pigeon's outage windows are short, and "a reply must not be lost".

### Status (forward-only)
```
updateOne({ workspace, clientRef, dir:'out', statusRank: { $lt: rank(new) } }, { $set: { status, statusRank, statusAt } })
```
A late `sent` after `delivered` matches nothing. A status for an unknown `clientRef` matches nothing and gets a 2xx, as PIGEON.md requires.
The send-success path never touches `status`, so a slow 2xx arriving after the `delivered` webhook cannot move the status back.

## 3. Realtime event log: Redis Streams (changed during the realtime phase)

**Change from the reviewed draft.** The draft kept events in a Mongo `events` collection with seq from a Mongo
`counters` doc. Two steps (allocate seq, then insert) let two instances commit 41 and 42 in either order, and a
socket would skip 41. The log now lives in **one Redis Stream per workspace**, appended by a Lua script that
does dedupe + `INCR` + `XADD` atomically. The entry id *is* the seq (`<seq>-0`), so stream order == seq order
across instances, with no holes from dedupe collisions. The `events` and `counters` collections are gone.

```
sb:seq:<ws>        counter            INCR per event; NOT cleared by reset (seq only ever goes up)
sb:ev:<ws>         stream             entries "<seq>-0" -> { f: <frame JSON without seq> }, MAXLEN ~10000
sb:dd:<ws>:<fact>  string, TTL 24 h   SET NX dedupe marker: in:<pmsg>, out:<ref>, st:<ref>:<status>, …
```

- **Append** (`realtime/eventStream.ts`): `SET dd NX` → if it already existed return 0 (fact already emitted,
  e.g. a retried webhook) → `INCR seq` → `XADD ev <seq>-0`. A guard bumps seq past the stream top if the
  counter was ever lost.
- **Live**: every instance tails all workspace streams with one blocking `XREAD`. A socket on instance A sees
  what instance B processed, in seq order.
- **Replay** (`/ws?after=N`): `XRANGE ev <N+1>-0 +`. Frames arriving during the replay are buffered and flushed
  after it. Each socket only sends `seq > lastSent`, so nothing is missed and nothing is repeated.
- **Durability trade-off**: Mongo stays the system of record for messages and conversations. The stream is
  the notification log. If Redis lost it, clients refetch over REST. See DECISIONS.md.

## 4. Redis keys (all prefixed `sb:`)

| Key | Type | TTL | Purpose | Reset clears |
|---|---|---|---|---|
| `sb:sess:<sha256(sid)>` | string (JSON) | 8 h, sliding | `{sub, name, email, workspaces}` | no |
| `sb:oidc:<state>` | string (JSON) | 10 min | `{verifier, nonce, returnTo}`, read once with GETDEL | no |
| `sb:seq:<ws>` | counter | — | realtime seq | **no** (must never go back) |
| `sb:ev:<ws>` | stream | MAXLEN ~10k | realtime event log | yes |
| `sb:dd:<ws>:<fact>` | string | 24 h | event dedupe marker | yes |
| `sb:rl:<ws>` | hash `{tokens, ts}` | 60 s | Pigeon token bucket (6, 3.5/s), shared by every instance (Lua, Redis clock) | yes |
| `sb:cool:<ws>` | string | Retry-After + 250 ms, or 1 s after a 503 | nobody sends for this workspace until it expires | yes |

Nothing in Redis is the system of record for business data. Losing it loses logins, rate-limit state and the
replay window, never a message or a reply.

## 5. Snapshot mapping (`GET /__grader/snapshot`)

| Snapshot field | Query |
|---|---|
| `contacts[c].inbound` | `messages.find({workspace, dir:'in'}).sort({contact, occurredAt, providerMessageId})` (Pigeon's own tie-break) → group the `providerMessageId`s by contact |
| `contacts[c].assignee` | `conversations.find({workspace})` |
| `outbound[ref]` | `messages.find({workspace, dir:'out'}, {clientRef, status})` |

## 6. Not stored (deliberately)

| What | Why |
|---|---|
| Raw webhook events | Idempotency lives on the business keys (`providerMessageId`, `clientRef` + rank), which is stronger than event-id dedupe. Pigeon may resend an event with a new id. |
| Users / workspaces | The IdP and config are the source of truth. Copying them would only add drift. |
| Encrypted notes | Cut for time. They would be `notes {workspace, contact, authorSub, ciphertext, iv, keyId, createdAt}`. The server never sees plaintext. |
