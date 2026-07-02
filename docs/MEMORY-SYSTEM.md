# Agent HQ Memory System — Design & Upgrade Plan

Status: **design doc — nothing below is implemented yet.**
Audience: solo builder. Optimized for "works this weekend," not "scales to a team of 50."

---

## 1. Current State (honest assessment)

- **Nothing is persisted.** Every agent session (Alfred, Code Lab, Ads Studio, Trading Desk, Social Chamber, Revify HQ, Learning Room) starts cold. Anything learned in a session dies with it.
- **The dashboard shows mock data.** The "Memory" number per room in `src/components/Dashboard.tsx` is a hardcoded prop, not a measurement.
- **No shared knowledge.** Trading Desk can't see a decision Revify HQ made yesterday. Alfred re-asks things you've already answered.
- **No audit trail.** If an agent does something wrong, there's no record of what it knew or why it acted.

The Hermes daemon (planned WebSocket state streamer) is the natural transport for memory events once memory exists. This doc defines what "memory exists" means.

---

## 2. Memory Tiers

Five tiers, each with a distinct lifespan and owner:

| Tier | Lifespan | Contents | Storage |
|---|---|---|---|
| **Working memory** | one prompt | whatever the orchestrator injects into context | in-context only, never written |
| **Session memory** | one task/session | task state, scratchpad, intermediate results | `memory/agents/<agent>/sessions/` |
| **Long-term memory** | months+ | facts, preferences, decisions, lessons learned | `memory/agents/<agent>/longterm.md` + JSONL |
| **Shared team memory** | months+ | cross-agent knowledge: project facts, contacts, conventions, decisions that bind everyone | `memory/shared/` |
| **Episodic log** | append-forever | what happened, when, by whom — audit & replay | `memory/episodes/*.jsonl` |

Key rule: **only the top two file tiers (long-term, shared) are ever injected into other agents' prompts.** Session memory is private to its agent; episodic logs are for humans and compaction jobs.

---

## 3. Storage: files first, database later

Do not start with a vector DB. For a solo operation with < a few thousand memory entries, `grep` + tags + recency beats embeddings, and you can read/edit everything in a text editor. Upgrade path:

1. **Phase 1:** Markdown + JSONL. Retrieval = tag match + recency.
2. **Phase 2:** SQLite index over the same files (FTS5 full-text search). Files stay the source of truth; SQLite is a rebuildable cache.
3. **Phase 3:** Add `sqlite-vec` embeddings **only when** you observe real retrieval misses (you search for a memory you know exists and keyword search can't find it). If you never hit that, skip Phase 3 forever.

### Directory schema

```
memory/
├── agents/
│   ├── alfred/
│   │   ├── longterm.md          # human-curated durable knowledge
│   │   ├── facts.jsonl          # machine-written durable entries
│   │   └── sessions/
│   │       └── 2026-07-02-1430-vercel-deploy/
│   │           ├── state.json   # task status, next steps
│   │           └── scratch.md   # free-form working notes
│   ├── code-lab/
│   ├── ads-studio/
│   ├── trading-desk/
│   ├── social-chamber/
│   ├── revify-hq/
│   └── learning-room/
├── shared/
│   ├── decisions.md             # numbered, dated, binding decisions
│   ├── facts.jsonl              # cross-agent facts
│   ├── contacts.md
│   └── conventions.md           # "how we do things here"
├── episodes/
│   └── 2026-07.jsonl            # one file per month, append-only
└── index.db                     # Phase 2: SQLite, gitignored, rebuildable
```

### File formats

**`facts.jsonl`** — one entry per line, machine-writable, greppable:

```json
{"id":"f-2026-07-02-091","type":"fact","text":"Revify HQ landing page converts best with the dark theme variant B","tags":["revify","marketing","ab-test"],"author":"ads-studio","created":"2026-07-02T14:30:00Z","confidence":0.8,"source":"session:2026-07-02-1430-ab-results","expires":null}
```

**`longterm.md` / `shared/decisions.md`** — human-readable, sectioned:

```markdown
## D-014 — Trading Desk position sizing (2026-06-28)
Max 2% of account per position. Decided after the June drawdown.
Author: user (via alfred). Supersedes: D-009.
```

**`episodes/2026-07.jsonl`** — append-only event log:

```json
{"ts":"2026-07-02T14:31:07Z","agent":"code-lab","event":"task_completed","task":"add websocket reconnect","tokens_in":48210,"tokens_out":3120,"memories_read":["f-2026-06-30-044"],"memories_written":["f-2026-07-02-091"]}
```

**`sessions/<id>/state.json`** — resumable task state:

```json
{"task":"deploy dashboard to vercel","status":"blocked","blocker":"missing VERCEL_TOKEN — ask user","steps_done":["build passes","vercel.json validated"],"next":["set token","run deploy-to-vercel.sh"],"updated":"2026-07-02T15:02:00Z"}
```

---

## 4. Write & Read Policies

### What gets promoted session → long-term

At session end (a "flush" step in each agent's loop), the agent proposes promotions. Promote only entries that pass **all**:

- **Durable:** still true/useful in 30 days ("prefers TypeScript strict mode" yes; "the build is currently failing" no).
- **Non-derivable:** not something re-computable from the codebase or a quick search.
- **Actionable:** would change a future agent's behavior.

Everything else stays in the session folder and ages out.

### Dedup, decay, compaction

- **Dedup at write time:** before appending a fact, grep `facts.jsonl` for overlapping tags + similar text. If a match exists, update it (bump `updated`, adjust `confidence`) instead of appending.
- **Decay:** entries carry optional `expires`. A weekly compaction job (cron) drops expired entries and flags entries not read in 90 days (check `memories_read` in episodes) for review.
- **Compaction:** the same job asks Alfred to summarize each agent's `facts.jsonl` into its `longterm.md` — merging duplicates, resolving contradictions (newest + highest confidence wins, superseded entries get `"superseded_by"`), and rewriting the markdown so it stays under ~300 lines per agent. Session folders older than 30 days are compacted to a single `summary.md` each.

### Avoiding memory poisoning

One agent writing garbage misleads every other agent. Defenses:

1. **Provenance is mandatory.** Every entry has `author`, `created`, `source`, `confidence`. Retrieval renders these, so a reading agent sees "ads-studio claims (confidence 0.6)" not naked truth.
2. **Shared memory is gated.** Agents write freely to their *own* `facts.jsonl`. Writes to `memory/shared/` go through Alfred (the orchestrator), which sanity-checks and can reject. Practically: agents write to `memory/shared/inbox/<agent>-*.json`; Alfred's compaction pass reviews and merges into `shared/facts.jsonl` or `decisions.md`.
3. **Decisions are only written by the user or Alfred-with-user-confirmation.** Never autonomously.
4. **Confidence caps:** machine-written entries start at ≤ 0.8. Only human review bumps to 1.0.
5. **Episodes are append-only** — never edited, so you can always reconstruct where a bad belief came from.

---

## 5. Retrieval Strategy (prompt injection by the orchestrator)

When Alfred spawns an agent for a task, it assembles a **memory block** and prepends it to the agent's system/context prompt.

### Selection (Phase 1–2, no embeddings)

1. **Always include:** the agent's `longterm.md` and `shared/decisions.md` (these are kept small by compaction — that's the point of the 300-line cap).
2. **Tag match:** extract keywords from the task description, grep the agent's and shared `facts.jsonl` for tag/text hits.
3. **Recency:** last N entries the agent wrote, plus any open `state.json` for a resumed task.
4. **Phase 3 only:** semantic search over `index.db` as a fallback when tag matching returns < 3 hits.

### Token budget

Cap the injected block at **~2,000 tokens by default** (~8k chars), configurable per agent (Trading Desk may warrant more). Fill order: open session state → shared decisions → tag-matched facts (by confidence × recency) → longterm.md excerpt. Truncate lowest-priority first. Log what was injected into the episode entry (`memories_read`) — this is what powers decay stats and the dashboard's "what does this agent know" panel.

### Injection format

```
<memory agent="trading-desk" injected="2026-07-02T15:10Z" budget_used="1430/2000 tokens">
[DECISION D-014, 2026-06-28, user] Max 2% of account per position.
[FACT f-2026-06-30-044, trading-desk, conf 0.8] IBKR paper account resets Sundays.
[SESSION resume] Task "backtest momentum v2" blocked on missing data key.
</memory>
```

---

## 6. Security

- **Never store credentials in memory files.** No API keys, tokens, cookies, private keys — not even "temporarily." Secrets live in env vars / a secret manager; memory entries may reference them by *name* only (`"needs VERCEL_TOKEN"`). Compaction job runs a secret-pattern scan (e.g. `gitleaks` or a regex pass for `sk-`, `ghp_`, AWS key shapes) and hard-fails on hits.
- **PII:** contacts/personal data go only in `memory/shared/contacts.md`, nowhere else, so there is exactly one file to protect/purge. Agents summarizing sessions must not copy email bodies or account numbers into facts.
- **Git hygiene:** add `memory/` to this repo's `.gitignore` (the dashboard repo is deploy-adjacent — memory must never ship to Vercel/Netlify). If you want history + sync, make `memory/` its own **private** git repo with its own remote.
- **Trading Desk caution:** never store broker credentials or full account numbers; position/PnL facts are fine.

---

## 7. Dashboard Integration Hooks

Replace the mocked per-room "Memory" number with real data, served by Hermes:

- **Memory usage per room:** Hermes stats each agent's directory (entry counts, bytes, last-write time) and streams it; the room card shows real `facts: 42 · sessions: 3 · updated 2h ago`.
- **"What does this agent know" panel:** clicking a room opens a panel listing that agent's `longterm.md` sections and most recent/most-read facts with provenance badges (author, confidence, age). Read-only in Phase 4; editing stays in your text editor.
- **Memory events over the Hermes WebSocket:**

```json
{"type":"memory.write","agent":"ads-studio","id":"f-2026-07-02-091","tags":["revify","ab-test"],"ts":"2026-07-02T14:30:00Z"}
{"type":"memory.inject","agent":"trading-desk","count":6,"tokens":1430,"ts":"2026-07-02T15:10:00Z"}
{"type":"memory.compaction","dropped":4,"merged":7,"ts":"2026-07-06T03:00:00Z"}
```

  The dashboard animates these as pulses along the hallway lines (a write in Ads Studio that Alfred promotes to shared = pulse from Ads Studio → Central Hub).

---

## 8. Phased Rollout

### Phase 1 — Files + conventions (~a weekend)
Create the directory tree, `.gitignore` entry, and a `MEMORY-CONVENTIONS.md` snippet added to every agent's system prompt (how to write facts, session flush, promotion rules). Alfred's spawn script does grep-based injection.
**Accept when:** an agent writes a fact in one session; a *different* session (same agent) and Alfred both retrieve and use it without you pasting anything. Secrets scan passes on the whole tree.

### Phase 2 — SQLite index + compaction cron (~1–2 evenings)
`index.db` with FTS5 over facts/decisions; `scripts/memory-index.py` rebuilds it from files; weekly cron runs compaction (dedup, decay, shared-inbox review, secret scan, per-agent `longterm.md` rewrite).
**Accept when:** deleting `index.db` and rebuilding yields identical query results; compaction run on a seeded messy corpus (duplicates, expired, contradiction) produces the correct merged state; `longterm.md` files stay ≤ 300 lines.

### Phase 3 — Semantic retrieval (only if needed)
Add `sqlite-vec` + a cheap embedding pass in the indexer; retrieval falls back to vector search when FTS returns < 3 hits.
**Accept when:** a held-out set of 10 "I know this memory exists" queries that FTS misses are all recovered by vector fallback; injection latency stays < 500 ms.

### Phase 4 — Dashboard integration
Hermes serves memory stats + streams the three event types above; room cards show real numbers; agent-knowledge panel renders `longterm.md` + top facts.
**Accept when:** writing a fact from a live agent session visibly updates the room card within 2 s, and the knowledge panel shows the new entry with correct provenance.

---

## Open questions (decide during Phase 1)

- Does Learning Room get write access to *other* agents' longterm files (it's the "trainer"), or does it also go through the shared inbox? (Recommend: inbox.)
- One episodes stream or per-agent? (Recommend: one, filtered by `agent` field — simpler tail/replay.)
- Memory repo sync cadence if you split it out: on compaction, or on every write?
