# memory/ — Agent HQ Memory (Phase 1 scaffolding)

Operator guide for the on-disk memory system. Full design, policies, and rationale:
**[docs/MEMORY-SYSTEM.md](../docs/MEMORY-SYSTEM.md)** — that doc is the source of truth; this file is just the map.

## Layout

```
memory/
├── agents/<agent>/           # one dir per agent (7 rooms)
│   ├── longterm.md           # human-curated durable knowledge (see longterm.example.md)
│   ├── facts.jsonl           # machine-written durable entries, one JSON object per line
│   └── sessions/<id>/        # per-task state: state.json + scratch.md (private to the agent)
├── shared/
│   ├── decisions.md          # numbered, dated, binding decisions (see decisions.example.md)
│   ├── facts.jsonl           # cross-agent facts
│   ├── contacts.md           # the ONLY file allowed to hold contacts/PII
│   ├── conventions.md        # "how we do things here"
│   └── inbox/                # agents drop proposed shared entries here for Alfred to review
├── episodes/
│   └── YYYY-MM.jsonl         # append-only event log, one file per month (see 2026-07.jsonl.example)
└── index.db                  # Phase 2 SQLite cache — rebuildable, never committed
```

Agents: `alfred` (hub/orchestrator), `code-lab`, `ads-studio`, `trading-desk`,
`social-chamber`, `revify-hq`, `learning-room`.

## Memory tiers (who reads what)

- **Session memory** (`agents/<agent>/sessions/`) — private to its agent; never injected into others.
- **Long-term** (`longterm.md`, `facts.jsonl`) and **shared** (`shared/`) — the only tiers injected into agent prompts.
- **Episodes** (`episodes/*.jsonl`) — append-only audit log for humans and compaction jobs. Never edited.

## Write rules

1. **Provenance is mandatory.** Every `facts.jsonl` entry carries `id`, `type`, `text`, `tags`,
   `author`, `created`, `confidence`, `source`, `expires`. Entries without provenance are invalid.
2. **Own lane only.** Each agent writes freely to its *own* `agents/<agent>/facts.jsonl` and
   `sessions/`. Nothing else.
3. **Shared memory is gated.** Agents propose shared entries as `shared/inbox/<agent>-*.json`;
   Alfred reviews and merges into `shared/facts.jsonl` / `shared/conventions.md`. No direct writes.
4. **Decisions** (`shared/decisions.md`) are written only by the user, or Alfred with explicit
   user confirmation. Never autonomously. (Learning Room also goes through the inbox — it does
   not write other agents' longterm files.)
5. **Confidence cap:** machine-written entries start at ≤ 0.8. Only human review bumps to 1.0.
6. **Episodes are append-only.** One event per line in the current month's file; never rewrite.
7. **Promotion** session → long-term only for entries that are durable (true in 30 days),
   non-derivable, and actionable. Everything else ages out with the session folder.

## Security

- **No secrets, ever.** No API keys/tokens/cookies/private keys anywhere under `memory/` —
  reference secrets by *name* only (e.g. "needs VERCEL_TOKEN").
- **PII only in `shared/contacts.md`** — one file to protect/purge. Never copy email bodies or
  account numbers into facts. Trading Desk: no broker credentials or full account numbers.
- **Git:** the local `.gitignore` here keeps only the skeleton, READMEs, `.example` templates,
  and `.gitkeep` files in git; real memory contents (facts, sessions, episodes, shared content,
  `index.db`, `*.local.*`) are excluded. Per the design doc, if you want history/sync for real
  memory, make `memory/` its own **private** repo — this deploy-adjacent repo must never ship it.

## Templates in this tree

- `agents/alfred/longterm.example.md` — long-term memory file format (example, fake data)
- `agents/alfred/facts.jsonl.example` — fact entry format with all provenance fields
- `shared/decisions.example.md` — decision record template
- `episodes/2026-07.jsonl.example` — episode event line format

Copy a template to its real name (drop `.example`) to start using it.
