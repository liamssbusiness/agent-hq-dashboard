# Palmier Pro — Setup & Quick-Start Guide

> Saved so you can follow it step-by-step once you're at your Mac.
> Palmier is a **macOS video editor built for AI** — generation lives on the
> timeline, and AI agents (Claude, Codex, Cursor) can edit your cut for you.

---

## 0. Before you start — can your machine even run it?

Palmier Pro is **Mac-only** and picky about the OS:

| Requirement | Needed |
|-------------|--------|
| Chip | **Apple Silicon** (M1 / M2 / M3 / M4 — *not* Intel Macs) |
| OS | **macOS 26 "Tahoe"** |
| Account | Free to edit. AI generation needs login + credits |
| Anthropic API key | Only for the in-app side-chat (uses *your* key) |

👉 **Check first:**  Apple menu → *About This Mac*.
- If it says "Apple M1/M2/M3/M4" → chip is good.
- If "macOS 26 Tahoe" → you're set. If older, update via *System Settings → General → Software Update* first.

If you're on an Intel Mac, Palmier won't run at all — stop here.

---

## 1. Install the app

1. Go to **https://github.com/palmier-io/palmier-pro** → **Releases** (right sidebar).
2. Download the latest `.dmg` (the base editor is open-source & free).
3. Open the `.dmg`, drag **Palmier Pro** into Applications.
4. First launch: right-click the app → *Open* (to bypass the "unidentified developer" warning), then *Open* again.
5. You can edit video immediately with **no login**. Sign in only when you want AI generation.

---

## 2. Connect Claude to Palmier (the magic part)

Every open Palmier project starts a **local MCP server** at:

```
http://127.0.0.1:19789/mcp
```

This is what lets Claude generate clips and edit your timeline by voice/text.

### Option A — Claude Desktop (easiest, recommended for you)
In Palmier: **Help → MCP Instructions → "Install in Claude Desktop"** → one click. Done.

### Option B — Claude Code (terminal)
```bash
claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp
```

### Option C — Cursor
Add to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "palmier-pro": {
      "type": "http",
      "url": "http://127.0.0.1:19789/mcp"
    }
  }
}
```

> ⚠️ The project must be **open in Palmier** for the MCP connection to work —
> the server only runs while the app/project is open.

### What you can then say to Claude
- *"Trim the dead air at the start of clip 3."*
- *"Reorder the clips so the hook comes first."*
- *"Generate a 5-second B-roll of a city skyline at night and drop it after the intro."*
- *"Cut this 4-minute take down to a tight 60-second vertical for TikTok."*

---

## 3. The in-app side-chat (optional)
Palmier also has a side-chat that uses **your own Anthropic API key**. Same tools
as the MCP server. Set it up in the app's settings → paste your key from
console.anthropic.com. Only needed if you don't want to route through Claude
Desktop/Code.

---

## ✅ First-session checklist
- [ ] Confirmed Apple Silicon + macOS 26 Tahoe
- [ ] Downloaded & installed Palmier Pro from GitHub Releases
- [ ] Opened it, edited a test clip (no login) to confirm it runs
- [ ] Created an account (for AI features)
- [ ] Connected Claude Desktop via Help → MCP Instructions
- [ ] Opened a project and asked Claude to make one small edit — confirmed it worked
- [ ] (Optional) Pasted Anthropic API key for the side-chat

Once those are checked, jump to **PALMIER-WORKFLOW.md** for the
film → edit → publish system.
