# Switchboard

A shared team inbox. Customers write in through the Pigeon messaging provider, support agents sign in through
OpenID Connect, see conversations arrive live, claim them, reply, and follow delivery status. Several workspaces
share one deployment and never see each other's data.

- **Server**: Express + TypeScript (`scaffold/server`), MongoDB, Redis, zod. Layers go routes → middleware →
  controllers → services → repositories.
- **Web**: React 19 + Vite + TanStack Query (`scaffold/web`), feature folders, realtime cache patching.

## Run it from a clean clone

Requirements: Node 22+, Docker.

```bash
npm run up                 # MongoDB, Redis, Pigeon (:4010), mock IdP (:4020) in Docker
npm run scaffold:install   # server + web dependencies (the "install" in switchboard.json)

npm run scaffold:server    # API on http://localhost:4000   (terminal 1)
npm run scaffold:web       # app on http://localhost:5173   (terminal 2)
```

Open http://localhost:5173, click **Sign in**, and pick a test user on the IdP page (for example Ben Ortiz, an agent in
`ws_acme`, or Eli Novak, an agent in both workspaces). `npm run inbound` makes a customer write in right away.

**Configuration**: everything comes from environment variables. The defaults equal `.env.example`, so no `.env`
is needed locally. To override, copy `scaffold/server/.env.example` to `scaffold/server/.env`. Values are checked
with zod at boot. Variables set in the shell (for example `PORT` from the check) always win.

## Tests and the check

```bash
npm --prefix scaffold/server test   # 24 tests: signature, rate limit, event stream, claim race, idempotency, leases
npm --prefix scaffold/web test      # 12 tests: message merge, forward-only status, frame -> cache
npm run check                       # level 1 (stop the dev server first: the check starts its own)
npm run check:full                  # levels 1, 2, 3, 5 -> CHECK_REPORT.json (needs Linux/macOS/WSL, see DECISIONS.md)
```

## Where things are

| Read | For |
|---|---|
| [DECISIONS.md](DECISIONS.md) | What was built and cut, assumptions, and what is still wrong |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, response envelope, module layout |
| [DB_SCHEMA.md](DB_SCHEMA.md) | Collections, indexes, write rules, Redis keys, realtime stream |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) | Web app structure, data flow, realtime |
| [PLAN.md](PLAN.md) | Phases and what was done |
| [CONVERSATION_LOG.md](CONVERSATION_LOG.md), [ai-logs/](ai-logs/) | Prompts used, and AI session exports |

Key server files: `webhooks` → `controllers/webhook.controller.ts`, `utils/hmac.ts`. Inbound → `services/inbound.service.ts`.
Replies → `services/reply.service.ts` and `workers/outbox.worker.ts`. Rate limit → `utils/rateLimit.ts`. Realtime →
`realtime/eventStream.ts` and `realtime/ws.gateway.ts`. Auth → `services/auth.service.ts`, `middleware/requireMember.ts`.
