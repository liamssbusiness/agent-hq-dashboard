# Alfred Device Agent

A tiny, safe program that runs on each of your machines (PC, Mac, Mac Studio) so
Alfred can **pull files** and **run a short allow-list of commands** on them —
only over your private Tailscale network.

## Why it's safe
- **No public exposure** — reachable only inside your Tailscale tailnet.
- **Token required** on every request (`DEVICE_AGENT_TOKEN`).
- **No arbitrary shell** — Alfred can only run commands you list in
  `ALLOWED_COMMANDS`, and only read files under `ALLOWED_ROOTS`.

## Setup (per machine, on July 16)
1. Install Tailscale and sign in (same account on every device + the cloud brain).
2. Copy `agent.py` to the machine.
3. Edit `ALLOWED_ROOTS` and `ALLOWED_COMMANDS` for what you want Alfred to touch.
4. Run it (and set it to auto-start):
   ```bash
   pip install fastapi "uvicorn[standard]"
   DEVICE_AGENT_TOKEN=your-shared-secret python agent.py
   ```
5. Note the machine's Tailscale hostname, e.g. `pc.tailnet-name.ts.net`.
6. In the cloud brain's `.env`, add it to `DEVICE_AGENTS`:
   ```
   DEVICE_AGENTS=http://pc.tailnet-name.ts.net:8765,http://macstudio.tailnet-name.ts.net:8765
   DEVICE_AGENT_TOKEN=your-shared-secret
   ```

Now Alfred's `device` tool can reach this machine from anywhere.

## Auto-start
- **Mac/Mac Studio:** a LaunchAgent plist, or `pm2 start agent.py --interpreter python3`.
- **Windows PC:** Task Scheduler "at logon", or NSSM as a service.
