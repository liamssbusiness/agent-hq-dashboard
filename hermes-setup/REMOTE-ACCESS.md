# 🌐 Can I reach my PC from my laptop while I'm away?

Honest framing first: **I can't see your PC or home network from the cloud
sandbox I run in — there's no way for me to "scan" for a connection.** What I
*can* do is tell you exactly how to check from your laptop and what has to be
true for it to work. This is the realistic decision tree.

## The one rule that decides everything
Remote access has to be **set up while you still have access to the machine**,
and the **PC has to stay powered on** (and not asleep) the whole month.

- If the PC is **off** and nothing was installed before you left → you're locked
  out until you're physically back. No tool can fix that remotely.
- If the PC is **on** and you (or it) already have one of the tools below → you
  may be able to get in right now.

## Step 1 — From your laptop, check what's ALREADY there
Try these in order. If any one connects, you're in.

| Tool | How to check from your laptop | Notes |
|------|-------------------------------|-------|
| **Tailscale** | Install Tailscale on laptop, log in same account → does your PC show as online? | Easiest, free, works through home routers/NAT. Best option if installed. |
| **Chrome Remote Desktop** | Go to https://remotedesktop.google.com/access on laptop, same Google account | Free, browser-based. PC must have had the host installed + be on. |
| **RustDesk / AnyDesk / TeamViewer** | Open the app on your laptop, enter your PC's ID | Works if the app was installed + set to start on boot + unattended access enabled. |
| **SSH** | `ssh user@your-home-ip` (needs port forwarding or Tailscale) | Powerful but usually needs router config done in advance. |
| **RDP (Windows)** | Microsoft Remote Desktop app → your home IP | Windows Pro only; needs port forwarding or a VPN/Tailscale. |

## Step 2 — If something connects
Open a terminal/desktop on the PC, go to the Hermes folder, and run the same
30-second steps in `WHEN-YOU-ARE-BACK.md`. The switch is identical whether
you're sitting at the PC or remoted in.

## Step 3 — If nothing connects
That means no remote host was set up before you left (or the PC is off/asleep).
Options:
- **Someone at home** could power it on / read you its Tailscale or AnyDesk ID.
- Otherwise, **wait until you're back** — the repo is staged so it's a 30-second
  job when you are.

## For NEXT time (so this is never a problem again)
Before leaving, install **Tailscale** on the PC and your laptop/phone, enable
**"start on boot"**, and set the PC's power settings to **never sleep**. Then your
PC is reachable from anywhere, securely, with zero router config — and you (or I,
if it exposes an SSH/API endpoint) could change Hermes's model from the road.
