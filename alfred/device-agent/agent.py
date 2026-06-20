"""Alfred Device Agent — runs on each of your machines (PC, Mac, Mac Studio).

Purpose: lets the cloud brain pull files and run a SMALL allow-list of commands
on this machine — but ONLY over your private Tailscale network, and ONLY things
you explicitly permit here. This is the "access and control my machines" lane.

Safety model (read this):
- Binds to your Tailscale IP only by default — not exposed to the public internet.
- Requires the shared DEVICE_AGENT_TOKEN on every request.
- Commands are an ALLOW-LIST. Arbitrary shell is NOT possible by design. Add the
  exact commands you want Alfred to be able to run to ALLOWED_COMMANDS below.
- File reads are sandboxed to ALLOWED_ROOTS.

Run:
    pip install fastapi "uvicorn[standard]"
    DEVICE_AGENT_TOKEN=your-shared-secret python agent.py
"""
import os
import subprocess
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import uvicorn

TOKEN = os.getenv("DEVICE_AGENT_TOKEN", "")
PORT = int(os.getenv("DEVICE_AGENT_PORT", "8765"))

# --- EDIT THESE for each machine ---
ALLOWED_ROOTS = [str(Path.home())]          # folders Alfred may read from
ALLOWED_COMMANDS = {                          # name -> argv. ONLY these can run.
    "uptime": ["uptime"],
    "disk": ["df", "-h"],
    # "build_revify": ["bash", "/Users/you/projects/revify/build.sh"],
}

app = FastAPI(title="Alfred Device Agent")


class Job(BaseModel):
    action: str          # read_file | list_dir | run
    target: str = ""     # path, or command name
    payload: str = ""


def _auth(authorization: str | None):
    if not TOKEN or authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="bad token")


def _allowed_path(p: str) -> Path:
    rp = Path(p).expanduser().resolve()
    if not any(str(rp).startswith(str(Path(r).resolve())) for r in ALLOWED_ROOTS):
        raise HTTPException(status_code=403, detail="path outside allow-list")
    return rp


@app.get("/health")
def health():
    return {"ok": True, "host": os.uname().nodename}


@app.post("/do")
def do(job: Job, authorization: str | None = Header(default=None)):
    _auth(authorization)

    if job.action == "list_dir":
        rp = _allowed_path(job.target or "~")
        return {"entries": sorted(p.name for p in rp.iterdir())}

    if job.action == "read_file":
        rp = _allowed_path(job.target)
        if rp.stat().st_size > 1_000_000:
            raise HTTPException(status_code=413, detail="file too large")
        return {"path": str(rp), "content": rp.read_text(errors="replace")}

    if job.action == "run":
        argv = ALLOWED_COMMANDS.get(job.target)
        if not argv:
            raise HTTPException(status_code=403, detail=f"command '{job.target}' not allow-listed")
        out = subprocess.run(argv, capture_output=True, text=True, timeout=120)
        return {"cmd": job.target, "stdout": out.stdout[-4000:], "stderr": out.stderr[-2000:], "code": out.returncode}

    raise HTTPException(status_code=400, detail="unknown action")


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Set DEVICE_AGENT_TOKEN first.")
    # 0.0.0.0 is fine because Tailscale ACLs gate who can reach this port.
    uvicorn.run(app, host="0.0.0.0", port=PORT)
