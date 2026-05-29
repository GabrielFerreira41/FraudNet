"""
BreachStore — persistence SQLite des événements de fuites financières mondiales.
Alimenté par le scanner RSS/Mistral ; consulté par le LLM Raisonneur (Agent 5).
"""
from __future__ import annotations
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path("data/breaches.db")

_DDL = """
CREATE TABLE IF NOT EXISTS breach_events (
    id           TEXT PRIMARY KEY,
    company      TEXT NOT NULL,
    country      TEXT NOT NULL,
    breach_type  TEXT NOT NULL,
    severity     TEXT NOT NULL,
    records      INTEGER NOT NULL DEFAULT 0,
    date         TEXT NOT NULL,
    description  TEXT NOT NULL,
    lat          REAL,
    lng          REAL,
    source_title TEXT,
    scanned_at   TEXT NOT NULL
)
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(_DDL)
    conn.commit()
    return conn


def save_breaches(breaches: list[dict]) -> int:
    """
    Upsert une liste de breaches.
    Retourne le nombre de lignes écrites (inserts + updates).
    """
    if not breaches:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    conn = _connect()
    count = 0
    with conn:
        for b in breaches:
            cur = conn.execute(
                """
                INSERT OR REPLACE INTO breach_events
                  (id, company, country, breach_type, severity, records,
                   date, description, lat, lng, source_title, scanned_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    b.get("id", ""),
                    b.get("company", ""),
                    b.get("country", "Unknown"),
                    b.get("type", "unknown"),
                    b.get("severity", "medium"),
                    int(b.get("records", 0)),
                    b.get("date", ""),
                    b.get("description", ""),
                    b.get("lat"),
                    b.get("lng"),
                    b.get("source_title", ""),
                    now,
                ),
            )
            count += cur.rowcount
    conn.close()
    return count


def get_active_breaches(days: int = 60) -> list[dict[str, Any]]:
    """Retourne les breaches scannés dans les derniers `days` jours."""
    conn = _connect()
    rows = conn.execute(
        """
        SELECT * FROM breach_events
        WHERE scanned_at >= datetime('now', ?)
        ORDER BY
          CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                        WHEN 'medium'   THEN 2 ELSE 3 END,
          date DESC
        """,
        (f"-{days} days",),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_breaches() -> list[dict[str, Any]]:
    """Retourne tous les breaches en base, triés du plus récent au plus ancien."""
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM breach_events ORDER BY date DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def breach_count() -> int:
    conn = _connect()
    n = conn.execute("SELECT COUNT(*) FROM breach_events").fetchone()[0]
    conn.close()
    return n


def clear_breaches() -> int:
    """Supprime tous les enregistrements. Retourne le nombre de lignes supprimées."""
    conn = _connect()
    cur = conn.execute("DELETE FROM breach_events")
    conn.commit()
    n = cur.rowcount
    conn.close()
    return n
