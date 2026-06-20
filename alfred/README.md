# Alfred — your always-on second brain

This folder is the real thing: a runnable, deployable Alfred you stand up once
and reach from **any device**, with **shared memory**, **email/calendar/files**,
and **control of your own machines** — all inside a **$50–100/month** budget.

## The architecture (5 pieces)

```
   Phone / Mac / PC  ──HTTPS──▶  ALFRED BRAIN  (always-on cloud, ~$7/mo)
                                 ├─ chat API + web UI        (brain/app.py)
                                 ├─ model router + budget    (brain/router.py)
                                 ├─ shared memory            (brain/memory.py)
                                 ├─ tools/connectors         (brain/connectors.py)
                                 └─ Alfred's identity        (brain/persona.py)
                                        │
                  ┌─────────────────────┼─────────────────────┐
              MCP │                 MCP │              Tailscale│
        Gmail/Cal/Drive          GitHub               Device Agents
        (July 16 wiring)                          (brain ⇄ PC/Mac/Studio)
                                                   device-agent/agent.py
```

| Piece | What it gives you | Status |
|-------|-------------------|--------|
| **Cloud brain** | Always reachable, even when home machines are off | ✅ built, runnable |
| **Shared memory** | One memory everywhere — the actual "second brain" | ✅ built (SQLite+FTS) |
| **Model router** | Cheap-by-default, escalate when needed, hard budget cap | ✅ built |
| **Web/phone UI** | Talk to Alfred from any browser | ✅ built |
| **Device agents** | Pull files + run/control your machines over Tailscale | ✅ built, deploy July 16 |
| **MCP connectors** | Gmail, Calendar, Drive, GitHub | 🔧 declared, wire July 16 |

## Why this design ends the drift
Every past attempt kept Alfred trapped on one machine with no shared memory, so
he "forgot" and depended on the PC being on. This separates **brain** (always-on,
remembers everything) from **muscle** (your powerful machines, used on demand).
You get continuity + reach now, and the Mac Studio just becomes extra muscle later.

## Run it locally in 2 minutes (you can do this TODAY, no PC needed)
```bash
cd alfred/brain
pip install -r requirements.txt
cp .env.example .env          # add OPENROUTER_API_KEY + a random ALFRED_ACCESS_TOKEN
uvicorn app:app --port 8080
# open http://localhost:8080
```

## Cost math (staying in $50–100)
- Cloud host: **~$7/mo** (Railway/Render starter, always-on).
- Models via OpenRouter: routine turns on `deepseek-v4-flash` cost fractions of a
  cent; the router only spends on the strong model for hard work and **stops**
  spending on it once you hit `ALFRED_STRONG_BUDGET_FRACTION` of the cap.
- Result: realistic **$40–90/mo total** depending on how hard you lean on it.

See **RUNBOOK-JULY16.md** for the exact go-live steps when you're home.
