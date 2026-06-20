"""Alfred's shared memory — the 'second brain'.

Design goals:
- Foolproof to run NOW: pure-stdlib SQLite, no external DB or services.
- Real recall: full-text search (FTS5) over everything Alfred has seen.
- Upgrade path: swap `recall()` for pgvector/embeddings later without touching
  the rest of the app. See UPGRADE notes at the bottom.

Three tables:
  messages  - every turn of every conversation (the running log)
  facts     - durable notes/decisions Alfred chooses to remember long-term
  spend     - token-cost ledger, used by the budget guard
"""
import os
import sqlite3
import time
from contextlib import contextmanager

DB_PATH = os.getenv("ALFRED_DB_PATH", "./alfred_memory.db")


@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init():
    with _conn() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL, device TEXT, role TEXT, content TEXT
            );
            CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL, topic TEXT, content TEXT
            );
            CREATE TABLE IF NOT EXISTS spend (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL, model TEXT, usd REAL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS search
                USING fts5(content, kind, ref UNINDEXED);
            """
        )


def log_message(role: str, content: str, device: str = "unknown"):
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO messages(ts,device,role,content) VALUES(?,?,?,?)",
            (time.time(), device, role, content),
        )
        con.execute(
            "INSERT INTO search(content,kind,ref) VALUES(?,?,?)",
            (content, "message", str(cur.lastrowid)),
        )


def remember_fact(topic: str, content: str):
    """Store a durable fact/decision Alfred should keep long-term."""
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO facts(ts,topic,content) VALUES(?,?,?)",
            (time.time(), topic, content),
        )
        con.execute(
            "INSERT INTO search(content,kind,ref) VALUES(?,?,?)",
            (f"{topic}: {content}", "fact", str(cur.lastrowid)),
        )


def recall(query: str, limit: int = 6) -> str:
    """Return the most relevant remembered snippets for the current query.

    UPGRADE PATH: replace the FTS query below with an embedding similarity
    search (pgvector / sqlite-vss) using ALFRED_MODEL_EMBED. The function
    signature and return type stay identical, so nothing else changes.
    """
    q = _fts_sanitize(query)
    if not q:
        return ""
    with _conn() as con:
        rows = con.execute(
            "SELECT content, kind FROM search WHERE search MATCH ? "
            "ORDER BY rank LIMIT ?",
            (q, limit),
        ).fetchall()
    if not rows:
        return ""
    return "\n".join(f"- ({r['kind']}) {r['content']}" for r in rows)


def recent(limit: int = 12):
    """Last N messages for short-term conversational context."""
    with _conn() as con:
        rows = con.execute(
            "SELECT role, content FROM messages ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


# --- budget ledger ---
def record_spend(model: str, usd: float):
    with _conn() as con:
        con.execute(
            "INSERT INTO spend(ts,model,usd) VALUES(?,?,?)", (time.time(), model, usd)
        )


def spend_this_month() -> float:
    month_start = time.time() - 30 * 24 * 3600
    with _conn() as con:
        row = con.execute(
            "SELECT COALESCE(SUM(usd),0) AS total FROM spend WHERE ts >= ?",
            (month_start,),
        ).fetchone()
    return float(row["total"])


def _fts_sanitize(s: str) -> str:
    # FTS5 chokes on bare punctuation; keep alnum tokens, OR them together.
    toks = [t for t in "".join(c if c.isalnum() else " " for c in s).split() if len(t) > 2]
    return " OR ".join(toks[:12])
