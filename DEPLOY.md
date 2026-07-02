# Agent HQ Dashboard — Deployment Guide

## Quick Deploy to Vercel (2 minutes)

### Step 1: Initialize Git

```bash
cd agent-hq-dashboard
git init
git add .
git commit -m "Initial Agent HQ dashboard"
```

### Step 2: Push to GitHub

```bash
# Create new repo on github.com
# Then:
git remote add origin https://github.com/YOUR_USERNAME/agent-hq-dashboard.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel

**Option A: CLI**
```bash
npm install -g vercel
vercel
```

**Option B: Web (Easiest for Phone)**
1. Go to https://vercel.com
2. Sign up with GitHub
3. Click "Import Project"
4. Select the GitHub repo
5. Click "Deploy"
6. Wait 2 minutes
7. Share the live URL

### Result
Your dashboard will be live at: `https://agent-hq-dashboard.vercel.app`

---

## Local Development

```bash
cd agent-hq-dashboard
npm install
npm run dev
```

Open http://localhost:3000

---

## What You'll See

✓ Central Hub (cyan) with 7 rooms
✓ Hallways connecting all rooms
✓ Glowing effect on active rooms
✓ Click any room to see details
✓ Zoom in/out with mouse wheel
✓ Mobile responsive (works on phone!)

---

## Next: Real Agent Data

Once deployed, we'll add:
1. WebSocket connection to Hermes daemon
2. Live agent state updates
3. Task progress visualization
4. Direct command execution

For now, it's a beautiful mock-up you can tweak!
