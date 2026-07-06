# AI Agency: Agentic Workflow Plan

**Status:** Draft v1 — 2026-07-02
**Scope:** How to evolve the Agent HQ Dashboard from a mockup into a working solo-builder multi-agent system.
**Related:** [`docs/MEMORY-SYSTEM.md`](./MEMORY-SYSTEM.md) (memory design), `README.md` (dashboard usage).

---

## 1. Honest Current State

What exists today:

- ✅ **Dashboard** — React/Vite canvas app rendering 7 rooms (Central Hub, Code Lab, Ads Studio, Trading Desk, Social Chamber, Revify HQ, Learning Room) with zoom/pan and animated communication lines.
- ❌ **Everything else is mock data.** `src/components/Dashboard.tsx` hardcodes rooms, `CommunicationFlow`s, and `Message`s in a `useEffect`. Nothing is real.

What does **not** exist yet:

| Component | Status |
|---|---|
| Hermes daemon (orchestrator) | Not started — referenced in README only |
| Any actual agent | None wired up |
| WebSocket connection | Dashboard has no WS client code |
| Memory / persistence | None (see `docs/MEMORY-SYSTEM.md` for the plan) |
| Task queue, budgets, audit log | None |

The gap: the vision is an "AI agency"; the implementation is a screensaver of one. That's fine — the dashboard is the *last* 10% of the system, and it's already built. The remaining 90% is the daemon and agents behind it. This doc is the plan for that 90%.

---

## 2. Recommended Architecture (Solo Builder Edition)

**One process. One machine. Boring storage.** Resist the urge to build microservices — a single orchestrator process ("Hermes daemon") is enough for years of solo use.

```
┌────────────────────────── Hermes Daemon (Node/TS or Python) ──────────────────────────┐
│                                                                                        │
│  Agent Registry ──► Task Queue ──► Runner (Claude Agent SDK / claude -p headless)      │
│       │                 │              │                                               │
│       │                 │              └──► per-run workspace, tool allowlist          │
│       ▼                 ▼                                                              │
│  Event Bus ─────► events.jsonl + SQLite (state, budgets, audit)                        │
│       │                                                                                │
│       ├──► WebSocket  ws://localhost:4870/ws   (live event stream → dashboard)         │
│       └──► REST       GET /agents /tasks /events, POST /tasks, POST /approve           │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                          ▲
                     Agent HQ Dashboard (this repo) subscribes via WS
```

Responsibilities:

1. **Agent registry + state machine.** Each room = one registered agent with a state: `offline → idle → working → waiting_approval → error`. The daemon owns state; the dashboard only renders it.
2. **Task dispatch.** Each task spawns a fresh agent run via the **Claude Agent SDK** (or `claude -p "..." --output-format stream-json` headless). One task = one run = one clean context.
3. **API for the dashboard.** WebSocket pushes events; a tiny REST API serves history and accepts new tasks/approvals.
4. **Persistence.** Append every event to `events.jsonl` (source of truth, greppable, trivially rebuildable) and mirror current state into SQLite for queries. No Postgres, no Redis, no Kafka.

### Event schema (replaces the dashboard's mock types)

These types replace `Message` / `CommunicationFlow` in `src/components/Dashboard.tsx`. Put them in a shared `src/types/events.ts` so daemon and dashboard agree.

```ts
type AgentId = 'hub' | 'code' | 'ads' | 'trading' | 'social' | 'revify' | 'learning';

interface BaseEvent {
  id: string;            // ulid
  ts: string;            // ISO 8601
  agent: AgentId;
}

type HermesEvent =
  | (BaseEvent & { type: 'agent_status'; status: 'offline' | 'idle' | 'working' | 'waiting_approval' | 'error' })
  | (BaseEvent & { type: 'task_started';   taskId: string; title: string })
  | (BaseEvent & { type: 'task_completed'; taskId: string; result: 'success' | 'failure' | 'needs_approval'; summary: string })
  | (BaseEvent & { type: 'message';        to: AgentId | 'human'; text: string })   // ← replaces mock Message
  | (BaseEvent & { type: 'error';          taskId?: string; message: string })
  | (BaseEvent & { type: 'token_usage';    taskId: string; inputTokens: number; outputTokens: number; costUsd: number });
```

Example WebSocket frame the dashboard consumes:

```json
{
  "id": "01J9ZK3W8QF2",
  "ts": "2026-07-02T21:14:03Z",
  "agent": "code",
  "type": "task_completed",
  "taskId": "task-42",
  "result": "success",
  "summary": "Fixed failing test in revify-api, opened PR #17"
}
```

Dashboard change: delete the mock `useEffect`, add `useWebSocket('ws://localhost:4870/ws')`, derive room `status` from the latest `agent_status` per agent, and derive communication lines from `message` events. The canvas rendering code stays exactly as is.

---

## 3. Agent Design Per Room

One principle above all: **any action that spends money or publishes publicly requires explicit human approval.** Agents produce *drafts and analyses* autonomously; humans press the button.

| Room | Job | Tools | Guardrails |
|---|---|---|---|
| **Central Hub** | Orchestrator persona ("Alfred"). Routes tasks, summarizes agent output, surfaces approvals. | Read access to registry/events; task dispatch. | Cannot execute work itself; only routes. |
| **Code Lab** | Coding agent: bug fixes, features, tests on your repos. | git, gh CLI, test runners, file edit — scoped to allowed repos. | Feature branches + PRs only. **Never pushes to main.** No deploy credentials. |
| **Learning Room** | Research/digest agent: summarize docs, papers, changelogs into notes. | Web search/fetch, write to a notes directory. | Read-only on the world. Lowest-risk agent — build it first or second. |
| **Revify HQ** | Business analyst for your product: metrics digests, churn/lead reports, draft roadmap items. | Read-only API/DB access to Revify analytics. | Read-only credentials. Drafts reports; never changes product data. |
| **Ads Studio** | Drafts ad copy, audiences, and budget proposals; analyzes campaign performance. | Ads platform **read** API; doc/asset generation. | **Never launches or edits a live campaign.** Emits `needs_approval`; you click "launch" in the ads platform yourself (later: an approval-gated apply step). |
| **Social Chamber** | Drafts posts/threads/replies; content calendar suggestions. | Content generation; read-only social analytics. | **Never publishes.** Drafts go to an approval queue; you approve → daemon posts (Phase 4+), or you copy-paste manually before that. |
| **Trading Desk** | Market analysis, watchlists, backtests, **paper trading only**. | Market data APIs, backtesting libs, paper-trading account. | **No live-funds credentials, ever, without a human-approval gate — and honestly, keep live trading manual indefinitely.** Hard-coded: agent config physically lacks brokerage write keys. |

Risk ordering (build in this order): Learning → Code Lab → Revify → Social → Ads → Trading.

---

## 4. Orchestration Patterns

- **Task queue.** SQLite table: `tasks(id, agent, title, prompt, status, created_at, ...)`. Statuses: `queued → running → done | failed | waiting_approval`. Start with concurrency = 1 (one agent working at a time); raise later only if needed.
- **Fresh context per run, memory for continuity.** Every task is a new agent process with a clean context window. Continuity comes from the memory system (see `docs/MEMORY-SYSTEM.md`): the runner injects the agent's memory digest into the prompt at start and writes learnings back at end. Never try to keep one long-lived chat per agent — it degrades and can't be restarted.
- **Retries.** On failure: retry once with the error appended to the prompt. Second failure → `error` state + event; a human looks. No infinite retry loops.
- **Budget caps.** Per agent per day: max tasks, max tokens, max $ (computed from `token_usage` events). Exceeding a cap sets the agent to `error` ("budget exceeded") and refuses new dispatches until midnight or manual reset. Suggested starting caps: $2/day per agent, $10/day total.
- **Kill switch.** `POST /kill` (and a big red button in the dashboard): daemon SIGTERMs all child runs, marks running tasks `failed`, sets every agent `offline`, and stops dispatching until `POST /resume`. Test this in Phase 1, not when you need it.
- **Timeouts.** Per-run wall-clock limit (e.g. 15 min). A hung agent is killed and treated as a failure.

---

## 5. Security

- **Secrets:** API keys live in env vars / an `.env` outside the repo (or a secret manager later). Never in code, never in the dashboard bundle — the dashboard is a *viewer* and holds zero credentials.
- **Least privilege per agent:** each agent gets its own tool allowlist and its own scoped credentials (e.g., a read-only ads token for Ads Studio, a repo-scoped GitHub token for Code Lab). The Trading Desk config contains **no** brokerage write credentials at all.
- **Audit log:** every tool call, task, approval, and dollar spent is an event in `events.jsonl`. Append-only. This is your black-box recorder when something goes wrong.
- **Approval gates as architecture, not prompts:** "don't publish without approval" must be enforced by *not giving the agent the publish credential*, with the daemon holding it and using it only after a human `POST /approve`. Prompt instructions are a courtesy, not a control.
- **No path to main / no path to money:** Code Lab can't push to protected branches (enforce via GitHub branch protection, not agent goodwill). No agent can move funds, period.
- **Local-first:** bind the daemon to `localhost`. If you ever expose it (e.g., checking the dashboard from your phone), add auth first — a static bearer token is fine for one user.

---

## 6. Phased Roadmap

Effort estimated in **evenings** (~2–3 focused hours each).

### Phase 0 — Harden the dashboard ✅ (this PR)
Types cleaned up, docs written, mock data clearly labeled as mock.
**Accept when:** dashboard builds and deploys; this doc and `MEMORY-SYSTEM.md` exist.

### Phase 1 — Hermes skeleton + live heartbeat ✅ (shipped)
Node/TS daemon: agent registry, event bus, JSONL persistence, WS + REST, and a **fake heartbeat generator** emitting valid `HermesEvent`s. Dashboard drops its mock `useEffect` and renders from the WS stream. Kill switch works.
**Accept when:** with the daemon off, dashboard shows all rooms `offline`; with it on, rooms animate from real events; restarting the daemon replays state from JSONL; `POST /kill` freezes everything.
**Shipped — all acceptance criteria met:** `hermes/` daemon (registry, WS + REST on 127.0.0.1:4870, demo heartbeat, JSONL audit log with **state replay on restart**, budget-cap 429, **`POST /kill`/`/resume` kill switch**) and `src/hooks/useHermes.ts` (auto-reconnect, mock fallback with LIVE/MOCK/PAUSED badge). Covered by `hermes/test/` (node:test) and CI.

### Phase 2 — First real agent: Learning Room or Code Lab ✅ (shipped & validated with a real run)
Wire the Claude Agent SDK / headless Claude Code into the runner. One agent, real tasks, tool allowlist, token/cost tracking, retry-once, timeout.
**Accept when:** you `POST /tasks {agent:'learning', prompt:'Summarize this week's Claude SDK changelog'}`, watch the room go `working` on the dashboard, and get a real artifact + accurate `token_usage` events. Budget cap trips correctly when set to $0.01.
**Shipped:** full task lifecycle (`queued`/`waiting_approval` → `running` → terminal) with a dispatcher, pluggable runner (`HERMES_RUNNER=claude` spawns headless `claude -p` in per-task workspaces with 5-min timeout and real token/cost parsing; `mock` for tests/demo), memory digest injection + episode logging per the memory doc, and the dashboard ops panel (New Task form, approve/reject buttons, kill switch, task list, message feed). **Validated end-to-end with a real run:** a `HERMES_RUNNER=claude` task to Learning Room completed through the full loop — dispatch → headless `claude -p` → genuine `token_usage`/cost events on the dashboard — and, because the runner injects `memory/agents/learning-room/longterm.md`, the agent correctly recalled a fact seeded into long-term memory (so Phase 3's injection half is proven too). Tool allowlists (each agent's `agents.json` `tools` list passed as `--allowedTools`) and retry-once on transient failures are also in. **Phase 2 complete.**

### Phase 3 — Memory integration ✅ (shipped & validated)
Implement `docs/MEMORY-SYSTEM.md`: memory digest injected at run start, learnings written back at run end.
**Accept when:** task N references a fact only learned in task N−1, across a daemon restart.
**Shipped:** digest injection at run start (validated by a real recall test), episode logging after every run, and write-back — each `claude` run is asked for 0–3 durable learnings which land in `memory/shared/inbox/<taskId>.md` with provenance frontmatter and `status: pending-review` (validated with a real run; agents never write shared memory directly — the poisoning defense from the memory doc). **Still open:** the human/Alfred review pass that promotes inbox proposals into `longterm.md`/`shared/` — until then, promote by hand (it's a file move).

### Phase 4 — Multi-agent + approval workflows (~5–8 evenings)
Second/third agent (Revify, Social). Approval queue: `needs_approval` tasks appear in dashboard with Approve/Reject buttons wired to `POST /approve`. Hub agent routes plain-English requests to the right room.
**Accept when:** Social Chamber drafts a post, the dashboard shows it `waiting_approval`, and *nothing* publishes until you click approve. Rejected drafts leave an audit event.

### Phase 5 — Revenue-adjacent agents behind gates (~ongoing)
Ads Studio (draft → human launches) and Trading Desk (paper trading + analysis only).
**Accept when:** a full month of ads drafts and paper trades with zero unapproved dollars moved — and you still *choose* to keep the human gates. If you're ever tempted to remove them, reread §5.

---

## 7. Next 3 Actions (This Week)

Items 1–3 of the original list (event types, daemon scaffold, WS hook) are done —
`src/types/events.ts`, `hermes/`, and `src/hooks/useHermes.ts` all exist and are
verified end-to-end. The new next three:

All three previous "next actions" are done (replay + kill switch; real Learning Room
run with genuine token accounting; memory digest injection validated by a recall
test). The new next three:

1. **Live it for a week.** Run `hermes` + dashboard daily, submit real tasks to Learning Room / Code Lab from the New Task form, promote good inbox proposals into `longterm.md` by hand, and note friction — that list becomes the Phase 4 backlog.
2. **Review pass for the inbox.** A small Alfred task (or dashboard button) that walks `memory/shared/inbox/`, lets you accept/edit/discard each proposal, and moves accepted ones into the right memory file.
3. **Start Phase 4.** Route plain-English requests through the hub agent to the right room, and add approve-from-phone ergonomics (the ops panel already has the buttons).

---

*The dashboard was the fun part. Phases 1–2 are the real product. Keep the daemon boring, keep the humans in the loop, and the agency will actually run.*
