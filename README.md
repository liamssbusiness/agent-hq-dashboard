# Agent HQ Dashboard

A neon, game-style control-center dashboard for a personal multi-agent AI system.
Seven color-coded "rooms" (agents) connected by glowing hallways, with live
communication flows, zoom/pan navigation, and per-room detail panels.

**Live repo:** https://github.com/liamssbusiness/agent-hq-dashboard

> Currently the dashboard renders **mock data**. The plan for wiring it to real
> agents lives in [`docs/AGENTIC-WORKFLOW-PLAN.md`](docs/AGENTIC-WORKFLOW-PLAN.md),
> and the agent memory design lives in [`docs/MEMORY-SYSTEM.md`](docs/MEMORY-SYSTEM.md).

## Rooms

| Room | Color | Role |
|---|---|---|
| Central Hub | cyan | Orchestrator — routes tasks and messages |
| Code Lab | green | Software/dev agent |
| Ads Studio | magenta | Ad campaign drafting (human-approved) |
| Trading Desk | orange | Market analysis / paper trading only |
| Social Chamber | purple | Social content drafting (human-approved) |
| Revify HQ | blue | Product/business operations |
| Learning Room | green | Research and study agent |

## Features

- Canvas-rendered map of all rooms with hallway connections
- Animated communication flows with message counts
- Click a room for status, task, token, and cost details
- Smooth zoom (scroll / pinch) and drag-to-pan
- Mobile responsive, dark sci-fi aesthetic

Two standalone demo pages ship in [`public/`](public/) and deploy alongside the
app: [`/dashboard.html`](public/dashboard.html) (pure-HTML dashboard) and
[`/simple.html`](public/simple.html). A static trading-dashboard mock lives at
[`trading-dashboard-full.html`](trading-dashboard-full.html).

## Development

```bash
npm ci
npm run dev        # http://localhost:3000
npm run typecheck  # TypeScript checks
npm run build      # production build → dist/
```

Requires Node 20.19+ (Node 22 recommended).

## Deployment

`dist/` is **not** committed — every host builds from source:

- **GitHub Pages:** push to `main`; `.github/workflows/deploy.yml` builds and deploys.
- **Vercel:** import the repo at https://vercel.com/import (framework: Vite). `vercel.json` sets build config and security headers.
- **Netlify:** import the repo; `netlify.toml` handles the rest.

## Security notes

- Never commit secrets. `.gitignore` blocks `.env*`, keys, and credential files.
- Never paste GitHub tokens or API keys into chats or issues. Use environment
  variables or your platform's secret manager.
- Deploy scripts never force-push.

## Tech stack

- **Frontend:** React 18 + native Canvas 2D rendering
- **Build:** Vite 7 + TypeScript
- **Styling:** Tailwind CSS
- **Hosting:** GitHub Pages / Vercel / Netlify (all free tiers)
- **Planned real-time:** WebSocket feed from the Hermes daemon (see docs/)

## Roadmap

See [`docs/AGENTIC-WORKFLOW-PLAN.md`](docs/AGENTIC-WORKFLOW-PLAN.md) for the
phased plan: Hermes daemon → first real agent → memory integration →
multi-agent approval workflows.
