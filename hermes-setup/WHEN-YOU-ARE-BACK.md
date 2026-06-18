# ⏱️ When you're back at your PC — switch Hermes to OpenRouter (≈30 seconds)

You're away for ~a month. Hermes lives only on your PC, so the actual switch
happens when you're physically back. Everything below is pre-staged so it's fast.

## The 30-second path

1. Open a terminal **inside your Hermes folder** (where its `.env` / config lives).
2. Run (paste your real OpenRouter key — starts with `sk-or-`):
   ```bash
   bash setup-hermes.sh sk-or-YOUR_REAL_KEY
   ```
3. **Restart Hermes.**
4. Open the dashboard / talk to Alfred — it's now on OpenRouter. ✅

If Hermes uses a `config.yaml` or `config.json` instead of `.env`, open
`.env.example` in this folder and copy the three values (base URL, key, model)
into the matching fields by hand.

## The model
`deepseek/deepseek-v4-flash` — cheapest-but-capable for agents (verified Jun 2026):
~$0.14/M input, $0.28/M output, 1M context, tuned for agent/tool-calling work.

Want smarter later? `deepseek/deepseek-v4-pro`.
Want a different cheap option? `google/gemini-2.0-flash-001`.

## Gotchas (the 3 things that usually break it)
1. **Model ID must be exact + lowercase:** `deepseek/deepseek-v4-flash` — no spaces, no version suffix.
2. **Base URL must be OpenRouter:** `https://openrouter.ai/api/v1` (not OpenAI's).
3. **Key must start with `sk-or-`** (OpenRouter), not `sk-` (OpenAI), and the
   account needs a little credit. Check/get it at https://openrouter.ai/keys

## Quick sanity check (optional, before restarting Hermes)
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer sk-or-YOUR_REAL_KEY" | head
```
If that returns JSON, your key works.
