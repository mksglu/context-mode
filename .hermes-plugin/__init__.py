"""Hermes Agent integration for Context Mode.

This plugin enforces the routing boundary around high-output terminal work,
injects current Hermes MCP tool names once per session, and keeps oversized
native tool results out of the model context. It uses only the Python standard
library and is intentionally independent of Hermes internals.
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
import sqlite3
import threading
import time
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

logger = logging.getLogger("hermes-context-mode")

HERMES_HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
PLUGIN_DIR = HERMES_HOME / "plugins" / "hermes-context-mode"
METRICS_DB = PLUGIN_DIR / "metrics.db"
SANDBOX_DIR = PLUGIN_DIR / "sandbox"

SANDBOX_THRESHOLD = 3 * 1024
_GUIDANCE_CAP = 1000

BLOCKED_HIGH_OUTPUT = re.compile(
    r"\b(?:curl|wget|docker\s+(?:build|compose\s+up)|make|cmake|gradle|mvn|"
    r"cargo\s+(?:build|test|run|check)|npx|npm\s+(?:run|start|test)|"
    r"playwright\s+(?:open|codegen|install)|"
    r"kubectl\s+(?:get|logs|describe|apply))\b",
    re.IGNORECASE,
)

BLOCKED_INLINE_HTTP = re.compile(
    r"\b(?:fetch\s*\(\s*['\"]https?://|"
    r"requests\.(?:get|post|put|delete|patch)\s*\(|"
    r"http\.(?:get|post|request)\s*\(|"
    r"urllib\.request\.urlopen\s*\(|"
    r"Invoke-(?:WebRequest|RestMethod)\b)",
    re.IGNORECASE,
)

NEVER_SANDBOX = {
    "write_file",
    "patch",
    "text_to_speech",
    "send_message",
    "vision_analyze",
}

SANDBOX_TOOLS = {
    "terminal",
    "read_file",
    "browser_snapshot",
    "browser_console",
    "browser_vision",
    "web_extract",
    "web_search",
    "execute_code",
}

_TOOL_PREFIX = "mcp__context_mode__"
ROUTING_BLOCK = f"""<context_window_protection>
  Context Mode is connected through the Hermes MCP server named context-mode.
  Its registered tools use the current Hermes prefix `{_TOOL_PREFIX}`.

  Think in Code: process, filter, count, parse, and aggregate inside the Context
  Mode sandbox. Print only the derived answer so raw bytes do not enter the
  conversation.

  Prefer:
  - `{_TOOL_PREFIX}ctx_batch_execute` to gather command output and index it.
  - `{_TOOL_PREFIX}ctx_search` to query indexed output and session memory.
  - `{_TOOL_PREFIX}ctx_execute` or `{_TOOL_PREFIX}ctx_execute_file` to analyze data.
  - `{_TOOL_PREFIX}ctx_fetch_and_index` for web content.

  Native terminal remains appropriate for short, predictable output and state
  mutations such as git, mkdir, rm, mv, and package installation. Native file
  reads remain appropriate when exact bytes are needed for an edit.

  High-output terminal fetch/build commands are blocked by this plugin. Do not
  retry them through terminal; use the matching Context Mode MCP tool.
</context_window_protection>"""

SESSION_GUIDANCE_SHOWN: "OrderedDict[str, None]" = OrderedDict()
_session_stats: dict[str, dict[str, Any]] = {}
_state_lock = threading.RLock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_stats(model: str = "", platform: str = "") -> dict[str, Any]:
    return {
        "tool_calls": 0,
        "bytes_saved": 0,
        "blocks": 0,
        "tools_saved": Counter(),
        "model": model,
        "platform": platform,
        "started": _utc_now(),
    }


def _stats_for(session_id: str) -> dict[str, Any]:
    key = session_id or "unknown"
    with _state_lock:
        return _session_stats.setdefault(key, _new_stats())


def _increment(session_id: str, field: str, amount: int = 1) -> None:
    with _state_lock:
        stats = _stats_for(session_id)
        stats[field] = int(stats.get(field, 0)) + amount


def _remember_guidance(session_id: str) -> bool:
    key = session_id or "unknown"
    with _state_lock:
        if key in SESSION_GUIDANCE_SHOWN:
            SESSION_GUIDANCE_SHOWN.move_to_end(key)
            return False
        SESSION_GUIDANCE_SHOWN[key] = None
        while len(SESSION_GUIDANCE_SHOWN) > _GUIDANCE_CAP:
            SESSION_GUIDANCE_SHOWN.popitem(last=False)
        return True


def _ensure_db() -> sqlite3.Connection:
    PLUGIN_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(METRICS_DB), timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS session_metrics (
            session_id TEXT PRIMARY KEY,
            platform TEXT,
            model TEXT,
            started TEXT,
            ended TEXT,
            tool_calls INTEGER DEFAULT 0,
            bytes_saved INTEGER DEFAULT 0,
            tools_saved TEXT DEFAULT '{}',
            blocks INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tool_savings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            tool_name TEXT,
            original_bytes INTEGER,
            saved_bytes INTEGER,
            sandbox_path TEXT,
            ts TEXT
        )
        """
    )
    conn.commit()
    return conn


def _snapshot_stats(session_id: str) -> Optional[dict[str, Any]]:
    with _state_lock:
        stats = _session_stats.get(session_id or "unknown")
        if stats is None:
            return None
        snapshot = dict(stats)
        snapshot["tools_saved"] = dict(stats["tools_saved"])
        return snapshot


def _persist_session(session_id: str) -> None:
    snapshot = _snapshot_stats(session_id)
    if snapshot is None:
        return
    try:
        with _ensure_db() as conn:
            conn.execute(
                """
                INSERT INTO session_metrics
                    (session_id, platform, model, started, ended, tool_calls,
                     bytes_saved, tools_saved, blocks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    platform=excluded.platform,
                    model=excluded.model,
                    ended=excluded.ended,
                    tool_calls=excluded.tool_calls,
                    bytes_saved=excluded.bytes_saved,
                    tools_saved=excluded.tools_saved,
                    blocks=excluded.blocks
                """,
                (
                    session_id or "unknown",
                    snapshot["platform"],
                    snapshot["model"],
                    snapshot["started"],
                    _utc_now(),
                    snapshot["tool_calls"],
                    snapshot["bytes_saved"],
                    json.dumps(snapshot["tools_saved"], sort_keys=True),
                    snapshot["blocks"],
                ),
            )
    except Exception as exc:  # pragma: no cover - metrics must fail open
        logger.debug("Session metrics save failed: %s", exc)


def _record_saving(
    session_id: str,
    tool_name: str,
    original_bytes: int,
    saved_bytes: int,
    path: str,
) -> None:
    try:
        with _ensure_db() as conn:
            conn.execute(
                """
                INSERT INTO tool_savings
                    (session_id, tool_name, original_bytes, saved_bytes,
                     sandbox_path, ts)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id or "unknown",
                    tool_name,
                    original_bytes,
                    saved_bytes,
                    path,
                    _utc_now(),
                ),
            )
    except Exception as exc:  # pragma: no cover - metrics must fail open
        logger.debug("Tool metrics save failed: %s", exc)


def _extract_command(args: Any) -> str:
    if not isinstance(args, dict):
        return ""
    command = args.get("command", "")
    return command if isinstance(command, str) else ""


def _extract_result_content(result: str) -> str:
    try:
        parsed = json.loads(result)
    except (json.JSONDecodeError, TypeError):
        return result
    if not isinstance(parsed, dict):
        return result
    for key in ("content", "output", "result"):
        value = parsed.get(key)
        if isinstance(value, str):
            return value
    return result


def on_session_start(
    session_id: str,
    model: str = "",
    platform: str = "",
    **_kwargs: Any,
) -> None:
    key = session_id or "unknown"
    with _state_lock:
        _session_stats[key] = _new_stats(model, platform)
        SESSION_GUIDANCE_SHOWN.pop(key, None)


def on_session_end(
    session_id: str,
    completed: bool = False,
    interrupted: bool = False,
    **_kwargs: Any,
) -> None:
    """Persist a turn snapshot without discarding session-scoped state."""
    del completed, interrupted
    _persist_session(session_id)


def on_session_finalize(
    session_id: Optional[str] = None,
    **_kwargs: Any,
) -> None:
    """Persist and release state at the current Hermes teardown boundary."""
    key = session_id or "unknown"
    _persist_session(key)
    with _state_lock:
        _session_stats.pop(key, None)
        SESSION_GUIDANCE_SHOWN.pop(key, None)


def pre_tool_call(
    tool_name: str,
    args: dict,
    task_id: str = "",
    session_id: str = "",
    **_kwargs: Any,
) -> Optional[dict[str, str]]:
    """Block terminal commands whose raw output should use Context Mode."""
    del task_id
    if tool_name != "terminal":
        return None
    command = _extract_command(args).strip()
    if not command:
        return None

    _increment(session_id, "tool_calls")
    if BLOCKED_HIGH_OUTPUT.search(command):
        _increment(session_id, "blocks")
        return {
            "action": "block",
            "message": (
                "context-mode blocked a high-output terminal command. Use "
                f"{_TOOL_PREFIX}ctx_execute or {_TOOL_PREFIX}ctx_batch_execute."
            ),
        }

    if BLOCKED_INLINE_HTTP.search(command):
        _increment(session_id, "blocks")
        url_match = re.search(r"https?://[^\s\"'()]+", command)
        suffix = f" for {url_match.group(0)}" if url_match else ""
        return {
            "action": "block",
            "message": (
                "context-mode blocked inline HTTP. Use "
                f"{_TOOL_PREFIX}ctx_fetch_and_index{suffix}."
            ),
        }
    return None


def transform_tool_result(
    tool_name: str,
    args: Any,
    result: str,
    session_id: str = "",
    task_id: str = "",
    **_kwargs: Any,
) -> Optional[str]:
    """Write large eligible results to disk and return a bounded pointer."""
    del args
    if tool_name in NEVER_SANDBOX or tool_name not in SANDBOX_TOOLS:
        return None
    if not isinstance(result, str):
        return None
    original_bytes = len(result.encode("utf-8"))
    if original_bytes <= SANDBOX_THRESHOLD:
        return None

    content = _extract_result_content(result)
    SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
    safe_tool = re.sub(r"[^A-Za-z0-9_.-]", "_", tool_name) or "tool"
    safe_task = re.sub(r"[^A-Za-z0-9_.-]", "_", task_id[:24]) or "na"
    filename = f"{time.time_ns()}_{safe_tool}_{safe_task}_{uuid4().hex[:8]}.txt"
    path = SANDBOX_DIR / filename
    path.write_text(content, encoding="utf-8")

    preview = html.escape(content[:200].strip(), quote=False)
    line_count = content.count("\n") + 1
    summary = (
        f'<sandboxed_output tool="{html.escape(tool_name, quote=True)}" '
        f'file="{html.escape(str(path), quote=True)}" lines="{line_count}">\n'
        "  Output exceeded 3 KiB and was written to a local sandbox file.\n"
        f"  Preview: {preview}\n"
        "</sandboxed_output>"
    )
    saved_bytes = max(0, original_bytes - len(summary.encode("utf-8")))
    _increment(session_id, "bytes_saved", saved_bytes)
    with _state_lock:
        stats = _stats_for(session_id)
        stats["tools_saved"][tool_name] += saved_bytes
    _record_saving(session_id, tool_name, original_bytes, saved_bytes, str(path))
    return summary


def pre_llm_call(
    session_id: str,
    user_message: str = "",
    is_first_turn: bool = False,
    **_kwargs: Any,
) -> Optional[dict[str, str]]:
    del user_message
    if not is_first_turn or not _remember_guidance(session_id):
        return None
    return {"context": ROUTING_BLOCK}


def register(ctx: Any) -> None:
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_hook("transform_tool_result", transform_tool_result)
    ctx.register_hook("pre_llm_call", pre_llm_call)
    ctx.register_hook("on_session_start", on_session_start)
    ctx.register_hook("on_session_end", on_session_end)
    ctx.register_hook("on_session_finalize", on_session_finalize)
    logger.info("hermes-context-mode registered (6 hooks)")
