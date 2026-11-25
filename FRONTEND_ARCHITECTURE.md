# Switchboard Web — frontend architecture

React 19 + Vite 8 + TypeScript (`scaffold/web`). The app is for support agents working a shared inbox: it must feel
instant, never show stale or duplicated messages, and survive a flaky connection.

## 1. Principles

| Principle | How |
|---|---|
| **Server state ≠ UI state** | All server data lives in **TanStack Query**. React state is only for local UI (draft text, open menus). No Redux. |
| **URL is the source of truth for navigation** | Workspace, open conversation and inbox filter are in the URL (`/w/:ws/c/:contact?filter=mine`), so the page can be shared or reloaded and the back button works. |
| **Realtime patches the cache, never the components** | One `RealtimeProvider` per workspace turns socket frames into cache patches or invalidations. Components only read queries. |
| **Idempotent writes from the client** | Every reply gets a `client_ref` (UUID) **before** the first attempt. A retry reuses it, so a double click or a flaky network cannot send twice. |
| **Feature folders, thin shared layer** | `features/<name>` owns its API calls, hooks and components. `shared/` holds only generic UI. `domain/` holds pure logic (unit-tested). |
| **One HTTP client, one error type** | `lib/http.ts` reads the server envelope and throws `ApiError {status, code, message, errors, requestId}`. The UI maps `code` to text through `constants/uiMessages.ts`. |
| **Role-aware UI, server-enforced** | `domain/permissions.ts` mirrors the server's permission map and only hides or disables controls. The server stays the authority. |

## 2. Layers and dependency rule

```
app/         providers, router, query client, error boundary          (wires everything)
features/    auth · workspace · inbox · conversation                    (screens + feature hooks + API calls)
realtime/    RealtimeConnection (socket) · RealtimeProvider · frame→cache
domain/      types · message merge/status rules · permissions           (pure, no React, tested)
lib/         http client · query keys · storage · time · ids            (no React)
shared/      ui primitives · toast                                       (no feature knowledge)
constants/   ui messages
styles/      tokens.css (light/dark design tokens) · global.css
```

Imports may only point **down** the list (`app → features → realtime → domain/lib/shared/constants`). Features never import
from each other except through `domain/` types and the shared query keys.

## 3. Folder layout

```
src/
  main.tsx
  app/        App.tsx  router.tsx  queryClient.ts  ErrorBoundary.tsx
  lib/        http.ts  queryKeys.ts  storage.ts  time.ts  ids.ts
  domain/     types.ts  messages.ts  messages.test.ts  permissions.ts
  realtime/   RealtimeConnection.ts  RealtimeProvider.tsx  frames.ts  frames.test.ts
  constants/  uiMessages.ts
  shared/ui/  Button.tsx  StatusBadge.tsx  Spinner.tsx  EmptyState.tsx  ConnectionIndicator.tsx
  shared/toast/ ToastProvider.tsx
  features/
    auth/          api.ts  useMe.ts  useLogout.ts  RequireAuth.tsx  LoginPage.tsx
    workspace/     WorkspaceLayout.tsx  WorkspaceSwitcher.tsx  useWorkspace.ts  RootRedirect.tsx
    inbox/         api.ts  useConversations.ts  ConversationList.tsx  InboxFilters.tsx
    conversation/  api.ts  useConversation.ts  useMessages.ts  useReply.ts  useConversationActions.ts
                   ConversationPane.tsx  ConversationHeader.tsx  MessageList.tsx  MessageBubble.tsx  Composer.tsx
  styles/     tokens.css  global.css
```

## 4. Routes

| Path | Screen | Guard |
|---|---|---|
| `/login` | Sign-in button → `GET /auth/login` (full-page redirect, PKCE runs on the server) | public |
| `/` | Redirects to the first workspace of the user | session |
| `/w/:workspaceId` | Inbox list + empty pane | session and membership |
| `/w/:workspaceId/c/:contact` | Inbox list + conversation | session and membership |
| `*` | Not found | — |

## 5. Data flow

```
             ┌──────────── TanStack Query cache ────────────┐
 components ─┤ me · conversations(ws, filter) · conversation │◄── patches / invalidations ── RealtimeProvider
   (read)    │ (ws, contact) · messages(ws, contact)         │                                   ▲
             └───────────────▲──────────────────────────────┘                                   │ frames {seq,...}
                             │ fetch / mutate                                         RealtimeConnection
                         lib/http.ts  ──►  /api/*  (Vite proxy → server)              /ws?workspace=&after=<lastSeq>
```

### Realtime connection (`realtime/RealtimeConnection.ts`)
- Opens `/ws?workspace=<id>&after=<lastSeq>`. `lastSeq` is kept in memory and in `sessionStorage` per workspace, so even
  a page reload replays only the missed frames.
- Drops frames with `seq <= lastSeq`, so replay overlap is harmless.
- Reconnects with exponential backoff and jitter (0.5 s → 10 s). It reconnects at once on the `online` event and when the tab becomes visible.
- After 3 failed attempts it rechecks `/api/me`. If that returns 401 the session has expired, so it stops and sends the user to `/login`.
- Exposes `status: connecting | open | reconnecting | offline`, shown by `ConnectionIndicator`.

### Frame → cache (`realtime/frames.ts`, pure and tested)
| Frame | Cache action |
|---|---|
| `message.inbound` / `message.outbound` | Upsert into `messages(ws, contact)` if the frame carries the message, otherwise invalidate it. Refresh the conversation list (debounced 300 ms). |
| `message.status` | Forward-only patch of the message with that `client_ref` (`queued < sent < delivered/failed`). |
| `conversation.assigned` | Patch `assignee` in `conversation(ws, contact)` and in the list pages. |
| `conversation.state` | Patch `state` (open/closed). Refresh the list. |
| unknown type | Refresh the list, so new server events still show up. |

### Replies (`features/conversation/useReply.ts`)
1. Create `client_ref = crypto.randomUUID()`.
2. Optimistically append `{status: 'queued', pending: true}` to the thread.
3. POST. On a network error or 5xx, retry up to 3 times with the **same** `client_ref`.
4. If every attempt fails, the bubble shows "Not sent · Retry". Retry reuses the same `client_ref`.
5. Status frames move the bubble through queued → sent → delivered / failed.

## 6. Role rules in the UI

| Action | agent | admin |
|---|---|---|
| Read, reply | ✓ (reply disabled if another agent holds the conversation) | ✓ always |
| Claim an unassigned conversation | ✓ | ✓ |
| Release / close / reopen own conversation | ✓ | ✓ |
| Release / take over someone else's | — | ✓ |

## 7. API contract the frontend uses

To be confirmed in the API design discussion. Envelope routes return `{success, code, message, data, meta, requestId}`.

| Method | Path | Data |
|---|---|---|
| GET | `/api/me` (raw) | `{ sub, name?, workspaces: [{id, role}] }` |
| POST | `/auth/logout` | — |
| GET | `/api/conversations?workspace&filter=open\|closed\|mine\|all&cursor&limit` | `data.items: Conversation[]`, `meta.nextCursor` |
| GET | `/api/conversations/:contact?workspace` | `data: Conversation` |
| GET | `/api/conversations/:contact/messages?workspace&before&limit` | `data.items: Message[]` (oldest first), `meta.prevCursor` |
| POST | `/api/conversations/:contact/replies?workspace` `{text, client_ref}` | 202, `data: Message` |
| POST | `/api/conversations/:contact/{claim,release,close,reopen}?workspace` | `data: Conversation` |
| WS | `/ws?workspace&after` | frames `{seq, type, contact, ...}` |

`contact` is a phone number with a `+`, so it is always passed through `encodeURIComponent`.

## 8. Quality

- **Accessibility**: the thread is `role="log"` with `aria-live="polite"`. Every control can be reached by keyboard, and Enter sends while Shift+Enter adds a new line. Focus styles are visible.
- **Theming**: colours come from tokens in `tokens.css`, with dark mode via `prefers-color-scheme`.
- **Resilience**: an error boundary per route, an "offline" banner, and optimistic updates that roll back on hard errors.
- **Tests**: `vitest` covers the pure logic most likely to be wrong: message merge and ordering, forward-only status, and frame-to-cache reduction.
- **Login**: the session cookie is set on `localhost:4000`. Browsers scope cookies by host, not port, so the app on `:5173` sends it through the Vite proxy as well.
