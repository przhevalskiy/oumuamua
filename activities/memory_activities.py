"""
Episodic memory activities — shared infrastructure for all swarm agents.

Two layers:
  facts.json     — structured key/value facts, written by any agent during a build
  episodes.jsonl — one JSON line per completed build, written by the orchestrator

Both live under .gantry/memory/ relative to repo_path.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from temporalio import activity

_MEMORY_DIR = ".gantry/memory"
_FACTS_FILE = "facts.json"
_EPISODES_FILE = "episodes.jsonl"


def _memory_dir(repo_path: str) -> Path:
    p = Path(repo_path) / _MEMORY_DIR
    p.mkdir(parents=True, exist_ok=True)
    return p


# ── Facts ─────────────────────────────────────────────────────────────────────

@activity.defn(name="memory_write_fact")
async def memory_write_fact(
    repo_path: str,
    key: str,
    value: str,
    agent: str = "unknown",
    confidence: float = 1.0,
) -> str:
    """Upsert a durable fact into facts.json."""
    facts_path = _memory_dir(repo_path) / _FACTS_FILE
    try:
        data: dict = json.loads(facts_path.read_text()) if facts_path.exists() else {}
    except Exception:
        data = {}
    data[key] = {
        "value": value,
        "agent": agent,
        "confidence": round(confidence, 2),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    facts_path.write_text(json.dumps(data, indent=2))
    return f"Fact '{key}' stored by {agent}."


@activity.defn(name="memory_read_facts")
async def memory_read_facts(repo_path: str, keys: list[str] | None = None) -> str:
    """
    Return all facts (or a subset by key list) as a formatted string.
    Facts older than TTL_DAYS are flagged as stale for architectural keys
    (prefixed with 'arch.' or 'pm.') and excluded from the default view.
    """
    TTL_DAYS = 90
    facts_path = _memory_dir(repo_path) / _FACTS_FILE
    if not facts_path.exists():
        return "No facts stored yet."
    try:
        data: dict = json.loads(facts_path.read_text())
    except Exception:
        return "Error reading facts (malformed JSON)."

    now = datetime.now(timezone.utc)
    subset = {k: v for k, v in data.items() if k in keys} if keys else data

    if not subset:
        return "No matching facts found."

    lines = []
    stale_keys: list[str] = []
    for k, v in subset.items():
        if isinstance(v, dict):
            # Check TTL for architectural/pm facts
            updated_at = v.get("updated_at", "")
            is_stale = False
            if updated_at and k.startswith(("arch.", "pm.")):
                try:
                    age = now - datetime.fromisoformat(updated_at)
                    if age.days > TTL_DAYS:
                        is_stale = True
                        stale_keys.append(k)
                except Exception:
                    pass
            if is_stale:
                continue  # exclude stale architectural facts from active context
            lines.append(f"**{k}** [{v.get('agent', '?')}]: {v.get('value', '')}")
        else:
            lines.append(f"**{k}**: {v}")

    if stale_keys:
        lines.append(
            f"\n[{len(stale_keys)} stale fact(s) excluded (>{TTL_DAYS}d old): "
            + ", ".join(stale_keys[:5])
            + "]"
        )

    return "\n".join(lines) if lines else "No active facts found (all may be stale)."


# ── Episodes ──────────────────────────────────────────────────────────────────

@activity.defn(name="memory_append_episode")
async def memory_append_episode(repo_path: str, episode: dict) -> str:
    """Append one completed-build record to episodes.jsonl."""
    eps_path = _memory_dir(repo_path) / _EPISODES_FILE
    episode.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    with eps_path.open("a") as f:
        f.write(json.dumps(episode) + "\n")
    return f"Episode recorded ({episode.get('outcome', 'unknown')})."


@activity.defn(name="memory_search_episodes")
async def memory_search_episodes(repo_path: str, query: str, top_k: int = 5) -> str:
    """
    BM25-style keyword search over past build episodes.
    Returns up to top_k relevant episodes as formatted text.
    """
    eps_path = _memory_dir(repo_path) / _EPISODES_FILE
    if not eps_path.exists():
        return "No past episodes recorded yet."

    episodes: list[dict] = []
    try:
        for line in eps_path.read_text().splitlines():
            line = line.strip()
            if line:
                episodes.append(json.loads(line))
    except Exception:
        return "Error reading episodes."

    if not episodes:
        return "No past episodes recorded yet."

    query_terms = set(re.findall(r"\w+", query.lower()))

    def _score(ep: dict) -> float:
        text = json.dumps(ep).lower()
        words = re.findall(r"\w+", text)
        total = len(words) or 1
        score = 0.0
        for term in query_terms:
            tf = words.count(term) / total
            idf = math.log(1 + len(episodes))  # simplified; corpus is small
            score += tf * idf
        return score

    ranked = sorted(episodes, key=_score, reverse=True)[:top_k]

    lines = [f"### Past Episodes (top {len(ranked)} matches for: {query!r})\n"]
    for ep in ranked:
        ts = ep.get("timestamp", "?")[:10]
        goal = ep.get("goal", "?")[:120]
        outcome = ep.get("outcome", "?")
        tier = ep.get("tier_label", ep.get("tier", "?"))
        decisions = ep.get("key_decisions", [])
        lines.append(f"**[{ts}] {outcome} | tier={tier}**")
        lines.append(f"Goal: {goal}")
        if decisions:
            lines.append("Decisions: " + "; ".join(str(d) for d in decisions[:3]))
        lines.append("")
    return "\n".join(lines)
