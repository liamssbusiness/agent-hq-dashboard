---
title: Agent HQ Dashboard — Live Deployment Instructions
date: 2026-05-20
github_username: liamssbusiness
repo_name: agent-hq-dashboard
---

# ⚡ AGENT HQ DASHBOARD — DEPLOYMENT IN PROGRESS

## Status: Ready to Deploy

Your dashboard code is built, committed to Git, and ready to push to GitHub.

## What You Have

✓ Full React + Pixi.js application  
✓ 7 interactive color-coded rooms  
✓ Hallways, zooming, clicking, animations  
✓ Mobile responsive design  
✓ Neon sci-fi aesthetic  

## Next Steps (Simple)

### Step 1: Create Empty GitHub Repo (Phone)

**URL:** https://github.com/new

**Fill in:**
- Repository name: `agent-hq-dashboard`
- Description: `Multi-agent AI system dashboard`
- Public: ✓ (checked)
- README: ☐ (unchecked)
- .gitignore: ☐ (unchecked)

**Click:** Create repository

**Result:** You now have an empty repo at:
```
https://github.com/liamssbusiness/agent-hq-dashboard
```

---

### Step 2: Alfred Pushes Code

Once repo is created, Alfred runs:

```bash
cd agent-hq-dashboard
git remote add origin https://github.com/liamssbusiness/agent-hq-dashboard.git
git push -u origin main
```

This uploads all the code to your GitHub repo.

---

### Step 3: Deploy to Vercel (Phone)

**URL:** https://vercel.com/import

**Steps:**
1. Sign in with GitHub
2. Select: `liamssbusiness` / `agent-hq-dashboard`
3. Click: Import
4. Framework preset: `Vite`
5. Click: Deploy
6. Wait 2-3 minutes

**Result:** You get a live URL like:
```
https://agent-hq-dashboard-abc123.vercel.app
```

---

### Step 4: View on Your Phone

Open the Vercel URL on your phone.

You'll see:
- 7 color-coded rooms
- Hallways connecting them
- Click rooms to see details
- Scroll to zoom
- Drag to pan

**All fully interactive. All works on mobile. Beautiful neon aesthetic.**

---

## Timeline

| Step | Action | Time | Who |
|------|--------|------|-----|
| 1 | Create GitHub repo | 2 min | You (phone) |
| 2 | Push code | 1 min | Alfred (auto) |
| 3 | Deploy to Vercel | 3 min | Vercel (auto) |
| 4 | Open on phone | 1 min | You (phone) |
| **TOTAL** | | **7 min** | |

---

## What to Do Next

**Once you see the dashboard on your phone:**

Tell me what you want to change:
- "Move Ads Studio to the right"
- "Change that room color to blue"
- "Make Trading Desk bigger"
- "Change task count to 5"
- "Rename Code Lab to AI Lab"

I'll update the code and redeploy automatically (2-3 min each change).

---

## After Design is Locked

Once you approve the visual design, I'll:

1. **Connect to Hermes daemon** via WebSocket
2. **Stream live agent data** into the dashboard
3. **Show real task counts** (not mocked)
4. **Display real memory usage**
5. **Show agent status** (working, idle, error)
6. **Enable command execution** (click room → send prompt to agent)

Your dashboard becomes **fully operational** control center for all 7+ AI agents.

---

## Commands Ready to Run

When you confirm GitHub repo is created, I'll execute:

```bash
# Push code to GitHub
git remote add origin https://github.com/liamssbusiness/agent-hq-dashboard.git
git push -u origin main

# Tell you to deploy on Vercel
echo "✓ Code pushed! Now deploy on Vercel at:"
echo "https://vercel.com/import"
```

---

## Troubleshooting

**Q: GitHub push fails?**  
A: Make sure the repo exists at https://github.com/liamssbusiness/agent-hq-dashboard

**Q: Vercel deployment fails?**  
A: Check that repo is public and has the code pushed

**Q: Dashboard looks broken on phone?**  
A: Refresh page, wait 5 seconds for Vercel to fully deploy

**Q: Can't see the rooms clearly?**  
A: Pinch to zoom out or scroll wheel (on some phones, use two-finger swipe)

---

## Your GitHub Repo

Once live:
```
https://github.com/liamssbusiness/agent-hq-dashboard
```

Shows:
- All source code
- Commit history
- Links to live Vercel deployment
- README with full docs

---

## Files in This Project

```
agent-hq-dashboard/
├── package.json                    # Dependencies (React, Pixi.js, etc)
├── vite.config.ts                 # Build configuration
├── tailwind.config.js             # Styling config
├── index.html                     # Entry point
├── README.md                      # Full documentation
├── DEPLOY.md                      # Deployment steps
├── deploy-to-vercel.sh           # Automated deploy script
└── src/
    ├── main.tsx                   # React entry
    ├── App.tsx                    # Main app component
    ├── index.css                  # Global styles
    └── components/
        └── Dashboard.tsx          # Main dashboard (7 rooms, zooming, clicking)
```

---

## Ready to Deploy?

**Send back:**
1. Confirm: "GitHub repo created"
2. I'll push code immediately
3. You deploy on Vercel
4. Live URL on your phone in 5 minutes

---

## Questions?

GitHub repo: https://github.com/liamssbusiness/agent-hq-dashboard  
Project folder: your local project folder

Everything is ready. Just need the signal to push! 🚀
