# Hermes Daemon (Phase 1 skeleton)

The orchestrator behind the Agent HQ Dashboard: agent registry, event bus,
append-only JSONL persistence, and a WebSocket + REST API. This is Phase 1 of
[`docs/AGENTIC-WORKFLOW-PLAN.md`](../docs/AGENTIC-WORKFLOW-PLAN.md) — no real
agents yet, just live state and a demo heartbeat that emits realistic events.

## Run

```bash
cd hermes
npm install
npm run demo    # daemon + simulated events every 2-4s
npm start       # daemon only (agents stay offline, no heartbeat)
```

Defaults to `127.0.0.1:4870`; override the port with `HERMES_PORT`.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ok:true}` |
| GET | `/state` | Full state: agents, recent messages, tasks |
| POST | `/tasks` | `{agentId, title}` → enqueues a stub task, returns `{taskId}`. 400 on unknown agent, 429 `"budget cap"` if the agent's `costUsd` ≥ its daily cap |
| POST | `/approve` | `{taskId}` → marks the task approved, writes an audit event |
| WS | `ws://127.0.0.1:4870` | Sends a `snapshot` event on connect, then broadcasts live events |

## Event schema

Everything sent over the WebSocket conforms **exactly** to
[`src/types/events.ts`](../src/types/events.ts) — that file is the source of
truth (`snapshot`, `agent_status`, `task_started`, `task_completed`, `message`,
`error`, `token_usage`). `token_usage.tokensUsed`/`costUsd` are cumulative
per-agent totals. All events (plus daemon-internal `audit` records, which are
persisted but not broadcast) are appended to `hermes/data/events.jsonl`.

## Security notes

- **Localhost-only.** The daemon binds to `127.0.0.1`. If you ever expose it,
  add auth first (a static bearer token is fine for one user).
- **No credentials in `agents.json`, ever.** It holds ids, names, budgets, and
  tool allowlists only. Secrets belong in env vars outside the repo.
- **Approval gates are architecture, not prompts.** Anything that spends money
  or publishes goes through `POST /approve`; the daemon holds the credential
  and acts only after a human approves. Every approval is an audit event in
  `events.jsonl` (see plan doc §5).
- `data/` is gitignored — event logs never get committed.
