#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# setup-hermes.sh — one-shot helper to point Hermes at OpenRouter.
#
# Run this ON YOUR PC when you're back, from inside your Hermes folder
# (the folder that holds Hermes's config / .env):
#
#   bash setup-hermes.sh sk-or-YOUR_REAL_KEY
#
# It writes a `.env` with the OpenRouter base URL + your key + the
# cheapest-but-capable model. It does NOT restart Hermes — do that
# yourself after confirming the file looks right.
#
# IMPORTANT: this writes `.env` in the CURRENT directory. Make sure
# you run it where Hermes actually reads its config from. If Hermes
# uses a config.yaml/json instead of .env, copy the values by hand.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

KEY="${1:-}"
MODEL="${2:-deepseek/deepseek-v4-flash}"

if [ -z "$KEY" ]; then
  echo "Usage: bash setup-hermes.sh <sk-or-...openrouter-key> [model-id]"
  echo "Example: bash setup-hermes.sh sk-or-abc123"
  exit 1
fi

case "$KEY" in
  sk-or-*) : ;;
  *) echo "WARNING: key does not start with 'sk-or-'. OpenRouter keys start with sk-or-."
     echo "         Continuing anyway in case your build differs..." ;;
esac

if [ -f .env ]; then
  cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
  echo "Backed up existing .env"
fi

cat > .env <<EOF
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=$KEY
OPENROUTER_API_KEY=$KEY
MODEL=$MODEL
EOF

echo "Wrote .env in: $(pwd)"
echo "Model set to:  $MODEL"
echo
echo "Next: restart Hermes, then watch its logs for a successful OpenRouter call."
echo "Verify the key works (optional):"
echo "  curl https://openrouter.ai/api/v1/models -H \"Authorization: Bearer $KEY\" | head"
