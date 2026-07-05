<!--
  EXAMPLE FILE — template for shared/decisions.md (numbered, dated, binding decisions).
  Decisions are written ONLY by the user, or by Alfred with explicit user confirmation —
  never autonomously (docs/MEMORY-SYSTEM.md §4). Placeholder content only.
  Copy to `decisions.md` and replace.
-->

# Shared Decisions (EXAMPLE)

Numbered `D-NNN`, dated, append new decisions at the top. A decision that replaces an older
one names it in `Supersedes:`; the old entry stays in place for the audit trail.

## D-002 — EXAMPLE: memory injection budget (2026-07-04)
Injected memory blocks are capped at ~2,000 tokens per agent by default.
Author: user (via alfred). Supersedes: none.

## D-001 — EXAMPLE: shared writes go through the inbox (2026-07-03)
Agents never write `shared/` directly; proposals go to `shared/inbox/<agent>-*.json` for
Alfred's review pass.
Author: user. Supersedes: none.
