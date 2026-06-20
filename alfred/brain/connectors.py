"""Tools Alfred can call.

Two kinds of tools live here:

A) BUILT-IN tools (work today, no setup): memory search, remember-fact, and
   talking to your device agents over Tailscale.

B) MCP connectors (wired on July 16): Gmail, Calendar, Drive, GitHub. These are
   declared here so the brain knows they exist; the actual MCP client wiring is
   a clearly-marked TODO so we don't pretend it's done.

Every tool returns a string (what Alfred 'sees' as the tool result).
"""
import json
import os

import httpx

import memory

DEVICE_AGENTS = [u for u in os.getenv("DEVICE_AGENTS", "").split(",") if u.strip()]
DEVICE_TOKEN = os.getenv("DEVICE_AGENT_TOKEN", "")


# ---------- A) built-in tools ----------
def tool_recall(query: str) -> str:
    hits = memory.recall(query)
    return hits or "No relevant memories found."


def tool_remember(topic: str, content: str) -> str:
    memory.remember_fact(topic, content)
    return f"Remembered under '{topic}'."


def tool_device(action: str, target: str = "", payload: str = "") -> str:
    """Ask a device agent (PC/Mac/Studio) to pull a file or run a command.

    Reaches the agent only over your private Tailscale network. The agent
    enforces its own allow-list — the brain cannot run arbitrary commands.
    """
    if not DEVICE_AGENTS:
        return ("No device agents configured yet. Set DEVICE_AGENTS once Tailscale "
                "is up on July 16 (see alfred/device-agent/README.md).")
    base = DEVICE_AGENTS[0]
    try:
        r = httpx.post(
            f"{base}/do",
            headers={"Authorization": f"Bearer {DEVICE_TOKEN}"},
            json={"action": action, "target": target, "payload": payload},
            timeout=30,
        )
        return r.text
    except Exception as e:
        return f"Could not reach device agent at {base}: {e}"


# ---------- tool schema exposed to the model ----------
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "recall",
            "description": "Search Alfred's long-term memory for anything relevant.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember",
            "description": "Store a durable fact or decision in long-term memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["topic", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "device",
            "description": "Pull a file from, or run an allow-listed command on, one "
                           "of the owner's machines (PC/Mac/Mac Studio) over Tailscale.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["read_file", "list_dir", "run"]},
                    "target": {"type": "string", "description": "path or command name"},
                    "payload": {"type": "string"},
                },
                "required": ["action"],
            },
        },
    },
]

DISPATCH = {
    "recall": lambda a: tool_recall(a.get("query", "")),
    "remember": lambda a: tool_remember(a.get("topic", ""), a.get("content", "")),
    "device": lambda a: tool_device(a.get("action", ""), a.get("target", ""), a.get("payload", "")),
}


def run_tool(name: str, raw_args: str) -> str:
    try:
        args = json.loads(raw_args or "{}")
    except json.JSONDecodeError:
        args = {}
    fn = DISPATCH.get(name)
    return fn(args) if fn else f"Unknown tool: {name}"


# ---------- B) MCP connectors (wired July 16) ----------
# TODO(July16): mount MCP servers for Gmail, Google Calendar, Google Drive, and
# GitHub. These exact servers already run in the Claude Code environment, so the
# plan is proven. Each becomes additional entries in TOOLS + DISPATCH, OR the
# brain connects to them as a real MCP client. See alfred/RUNBOOK-JULY16.md.
MCP_PLANNED = ["gmail", "google_calendar", "google_drive", "github"]
