#!/bin/bash
# Agent HQ Dashboard — One-Click Vercel Deployment
# Usage: bash deploy-to-vercel.sh

set -e

PROJECT_DIR="/c/Users/the10/Downloads/agent-hq-dashboard"
GITHUB_USERNAME="liamssbusiness"
REPO_NAME="agent-hq-dashboard"
GITHUB_REPO="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        AGENT HQ DASHBOARD — DEPLOYING TO VERCEL               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_DIR"

# Step 1: Check if repo exists on GitHub
echo "📋 Checking GitHub repo..."
if git remote get-url origin 2>/dev/null; then
    echo "✓ Remote already configured"
else
    echo "🔗 Adding GitHub remote..."
    git remote add origin "$GITHUB_REPO"
    echo "✓ Remote added"
fi

# Step 2: Push to GitHub
echo ""
echo "📤 Pushing code to GitHub..."
git push -u origin main --force
echo "✓ Code pushed to GitHub"

# Step 3: Display Vercel deployment instructions
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              DEPLOY ON VERCEL (Final Step!)                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "✓ Code is now on GitHub!"
echo ""
echo "Next: Deploy to Vercel via web UI"
echo ""
echo "1. Go to: https://vercel.com/import"
echo "2. Sign in with GitHub"
echo "3. Select: liamssbusiness / agent-hq-dashboard"
echo "4. Click: Import"
echo "5. Framework: Vite"
echo "6. Click: Deploy"
echo "7. Wait 2-3 minutes for deployment"
echo "8. You'll get a live URL like:"
echo "   https://agent-hq-dashboard-xxx.vercel.app"
echo ""
echo "Then open that URL on your phone!"
echo ""
echo "═════════════════════════════════════════════════════════════════"
echo ""
echo "Repository: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
echo "Local code: ${PROJECT_DIR}"
echo ""
echo "✅ Ready to deploy!"
