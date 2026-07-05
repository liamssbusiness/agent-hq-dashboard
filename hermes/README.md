# Hermes Daemon (Phase 1 + Phase 2 core)

The orchestrator behind the Agent HQ Dashboard: agent registry, event bus,
append-only JSONL persistence with state replay, a task lifecycle with
human-approval gates, a pluggable runner, a kill switch, and a WebSocket + REST
API. Phases 1–2 of [`docs/AGENTIC-WORKFLOW-PLAN.md`](../docs/AGENTIC-WORKFLOW-PLAN.md).

## Run

```bash
cd hermes
npm install
npm run demo    # daemon + simulated events + a demo task every ~20s
npm start       # daemon only (agents stay offline until events arrive)
npm test        # node:test suite (lifecycle, approvals, kill switch, CORS, replay)
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `HERMES_PORT` | `4870` | Listen port (always bound to `127.0.0.1`) |
| `HERMES_DEMO` | off | `1` → heartbeat simulation + auto demo tasks (mock runner forced) |
| `HERMES_RUNNER` | `mock` | `mock` (canned 2–5s runs) or `claude` (headless `claude -p` per task) |
| `HERMES_DATA_DIR` | `hermes/data/` | Where `events.jsonl` and per-task `workspaces/<taskId>/` live |
| `HERMES_MEMORY_DIR` | `../memory/` | Root of the memory tree (see `docs/MEMORY-SYSTEM.md`) |
| `HERMES_MOCK_DELAY_MS` | unset | Pins the mock runner's 2–5s delay (test knob) |

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ok:true, paused}` |
| GET | `/state` | Full state: agents, recent messages, tasks, paused flag |
| POST | `/tasks` | `{agentId, title, prompt?}` → creates a task. Agents with `needsApproval: true` in `agents.json` (ads, social, trading) start in `waiting_approval`; others go straight to `queued`. 400 unknown agent, 429 budget cap, 409 while paused |
| POST | `/approve` | `{taskId}` → `waiting_approval` → `queued` (audited) |
| POST | `/reject` | `{taskId}` → `rejected`, terminal (audited) |
| POST | `/kill` | Kill switch: pause dispatching, agents → `offline`, running tasks → `failed` |
| POST | `/resume` | Unpause; agents return to `idle` |
| WS | `ws://127.0.0.1:4870` | `snapshot` on connect, then live event broadcast |

Task lifecycle: `queued`/`waiting_approval` → `running` → `completed`/`failed`
(or `rejected`). Every transition broadcasts a `task_update` event and is
audit-logged.

## Runners

- **mock** — default; simulates a 2–5 second run with plausible token/cost
  numbers. Used by tests and demo mode.
- **claude** — spawns `claude -p "<prompt>" --output-format json` in an
  isolated per-task workspace under `data/workspaces/<taskId>/`, 5-minute
  timeout, parses real token usage and cost from the CLI's JSON output. Uses
  your local `claude` login — the daemon never sees or stores credentials.

**Memory hooks** (per [`docs/MEMORY-SYSTEM.md`](../docs/MEMORY-SYSTEM.md)):
before a `claude` run the agent's `memory/agents/<dir>/longterm.md` (if any)
is prepended to the prompt as a `## Your memory` block (truncated to ~2000
chars); after every successful run (mock included) an episode line
`{ts, agent, taskId, event:"task_completed", summary}` is appended to
`memory/episodes/YYYY-MM.jsonl` (created if missing). Agent → memory dir:
hub→alfred, code→code-lab, ads→ads-studio, trading→trading-desk,
social→social-chamber, revify→revify-hq, learning→learning-room.

## Event schema

Everything sent over the WebSocket conforms **exactly** to
[`src/types/events.ts`](../src/types/events.ts) — that file is the source of
truth. `token_usage.tokensUsed`/`costUsd` are cumulative per-agent totals. All
events (plus daemon-internal `audit` records, which are persisted but not
broadcast) are appended to `hermes/data/events.jsonl`, and the daemon replays
that log on startup so state survives restarts: cumulative per-agent
`tokensUsed`/`costUsd`, last agent status, the last 50 messages, all
non-terminal tasks plus the last 20 terminal ones, and the paused flag.
Corrupt or unknown lines are skipped; tasks left `running` by a dead daemon
are marked `failed`.

## Security notes

- **Localhost-only.** The daemon binds to `127.0.0.1`. If you ever expose it,
  add auth first (a static bearer token is fine for one user).
- **CORS allowlist, never wildcard.** Cross-origin requests are only honored
  from `http(s)://localhost[:port]` / `127.0.0.1` origins, for both REST and
  WebSocket upgrades — a random website in your browser cannot drive the daemon.
- **No credentials in `agents.json`, ever.** It holds ids, names, budgets,
  approval flags, and tool allowlists only. Secrets belong in env vars outside
  the repo.
- **Approval gates are architecture, not prompts.** Anything that spends money
  or publishes goes through `POST /approve`; the daemon holds the credential
  and acts only after a human approves. Every approval/rejection is an audit
  event in `events.jsonl` (see plan doc §5).
- **Kill switch first.** `POST /kill` (or the dashboard's red button) halts all
  dispatching instantly and survives until an explicit `/resume`.
- `data/` is gitignored — event logs and workspaces never get committed.
