# 🚀 Go-live runbook — July 16 (when you're home)

Everything is pre-built. This is the order of operations to turn it on. Budget
~60–90 minutes the first time. Each step is independent — if one stalls, the
earlier steps still leave you with a working Alfred.

---

## Phase 0 — You can do this NOW, before July 16 (no PC needed)
From your laptop:
1. Make an **OpenRouter** account + key (https://openrouter.ai/keys), add ~$20 credit.
2. Make a **Railway** (or Render) account.
3. That's it. The brain can go live from your phone/laptop in Phase 1 even before
   you touch the PC — your old Hermes keeps running until you're ready to retire it.

---

## Phase 1 — Stand up the always-on brain (≈15 min)
1. Deploy this repo to Railway/Render using `alfred/deploy/railway.json` (or
   `render.yaml`). Point it at `alfred/brain/Dockerfile`.
2. Set env vars (from `alfred/brain/.env.example`):
   - `OPENROUTER_API_KEY`  (your sk-or- key)
   - `ALFRED_ACCESS_TOKEN` = `python -c "import secrets;print(secrets.token_urlsafe(32))"`
   - `ALFRED_MONTHLY_BUDGET_USD=100`
3. Open the deployed URL. In the browser console run:
   `localStorage.alfredToken = "PASTE_YOUR_ACCESS_TOKEN"` then reload.
4. Say hi to Alfred. **He is now live on every device.** ✅
5. Add the URL to your phone home screen (Share → Add to Home Screen) — it behaves
   like an app.

**Checkpoint:** you now have an always-on Alfred with shared memory and a budget
guard, reachable from anywhere. Everything below adds *power*.

---

## Phase 2 — Connect email / calendar / files (≈20 min)
Wire the MCP connectors declared in `brain/connectors.py`:
1. Gmail + Google Calendar + Google Drive: connect via OAuth (these exact MCP
   servers already run in the Claude Code environment — reuse that setup).
2. GitHub: a fine-grained token scoped to your repos.
3. Add each as an entry in `connectors.TOOLS` + `connectors.DISPATCH`, or connect
   the brain to them as a real MCP client. Redeploy.
4. Test: ask Alfred "what's on my calendar tomorrow?" and "summarize my unread email."

---

## Phase 3 — Mesh your machines with Tailscale (≈20 min) — THIS NEEDS THE PC
1. Install **Tailscale** on: the cloud brain, your **PC**, your **Mac**, (later)
   the **Mac Studio**, and your **phone**. Same account on all.
2. Set the PC/Mac to **never sleep** and Tailscale to **start on boot**.
3. On the PC and Mac, run the device agent (`alfred/device-agent/agent.py`) — see
   its README. Edit `ALLOWED_ROOTS`/`ALLOWED_COMMANDS` for what Alfred may touch.
4. Add the agents' Tailscale URLs to the brain's `DEVICE_AGENTS` env var + set
   `DEVICE_AGENT_TOKEN`. Redeploy.
5. Test: ask Alfred to "list the files in my projects folder on the PC" and to
   "run uptime on the Mac."

**Now Alfred can reach and act on your machines from anywhere.**

---

## Phase 4 — Retire old Hermes + point the dashboard at the brain (≈10 min)
1. Confirm new Alfred covers what Hermes did. Inspect the old PC code if useful,
   but you should NOT need to migrate it — memory + connectors replace it.
2. Stop the old Hermes process.
3. Point the Agent HQ dashboard's data calls at the brain's API (the dashboard
   becomes Alfred's "face").

---

## Phase 5 — Mac Studio as muscle (whenever it arrives)
1. Tailscale + device agent on the Studio.
2. For heavy/local model work, run an OpenAI-compatible local server (e.g. an
   Ollama/LM-Studio endpoint) on the Studio and add it to `router.py` as a third
   tier — near-zero marginal cost for big jobs, brain stays in the cloud.

---

## If something breaks
- Brain won't start → check `OPENROUTER_API_KEY` is set and has credit.
- 401 from the UI → `localStorage.alfredToken` must equal `ALFRED_ACCESS_TOKEN`.
- Can't reach a device → is Tailscale up on both ends? Is the agent running?
- Spend too high → lower `ALFRED_STRONG_BUDGET_FRACTION` or the monthly cap.
