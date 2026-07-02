#!/bin/bash
# Agent HQ Dashboard — Push to GitHub, then deploy via Vercel
# Usage: bash deploy-to-vercel.sh
# Run from the repository root.

set -euo pipefail

GITHUB_USERNAME="liamssbusiness"
REPO_NAME="agent-hq-dashboard"
GITHUB_REPO="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

cd "$(dirname "$0")"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        AGENT HQ DASHBOARD — DEPLOYING TO VERCEL               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Ensure remote is configured
echo "📋 Checking GitHub remote..."
if git remote get-url origin >/dev/null 2>&1; then
    echo "✓ Remote already configured"
else
    echo "🔗 Adding GitHub remote..."
    git remote add origin "$GITHUB_REPO"
    echo "✓ Remote added"
fi

# Step 2: Push to GitHub (never force-push main — resolve conflicts locally instead)
echo ""
echo "📤 Pushing code to GitHub..."
git push -u origin main
echo "✓ Code pushed to GitHub"

# Step 3: Vercel deployment instructions
echo ""
echo "Next: Deploy to Vercel via web UI"
echo ""
echo "1. Go to: https://vercel.com/import"
echo "2. Sign in with GitHub"
echo "3. Select: ${GITHUB_USERNAME} / ${REPO_NAME}"
echo "4. Framework: Vite → Deploy"
echo ""
echo "Repository: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
echo "✅ Ready to deploy!"
