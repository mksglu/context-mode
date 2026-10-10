"""Hermes Agent control plane for the canonical context-mode MCP server.

All callbacks are bounded and fail open. Session persistence/routing remains in
the existing JavaScript hooks and SessionDB; this module only translates the
public Hermes plugin lifecycle into that wire protocol.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import uuid
from typing import Any


_TIMEOUT = 2.0
_INDEX_TIMEOUT = 8.0
_MAX_CAPTURE = 2 * 1024 * 1024
_INDEX_THRESHOLD = 16 * 1024
_CTX_PREFIX = "mcp__context_mode__ctx_"
_ALIASES = {"terminal": "Bash", "delegate_task": "Agent", "search_files": "Grep"}
# Mutating/interactive results must remain verbatim. Context-mode's own tools
# are also exempt to prevent recursive indexing.
_RESULT_TOOLS = {"read_file", "search_files", "web_extract", "web_search", "browser_snapshot", "browser_console", "browser_extract"}
_state_lock = threading.RLock()
_index_lock = threading.Lock()
_seen_sessions: set[str] = set()
_ctx: Any = None


def _sid(kwargs: dict[str, Any]) -> str:
    return str(kwargs.get("session_id") or kwargs.get("task_id") or "hermes")


def _project(kwargs: dict[str, Any]) -> str:
    return str(kwargs.get("project_dir") or kwargs.get("cwd") or os.getcwd())


def _run_hook(event: str, payload: dict[str, Any], timeout: float = _TIMEOUT) -> dict[str, Any] | None:
    executable = os.environ.get("CONTEXT_MODE_EXECUTABLE") or shutil.which("context-mode")
    if not executable:
        return None
    env = os.environ.copy()
    env["CONTEXT_MODE_PLATFORM"] = "hermes"
    try:
        proc = subprocess.run(
            [executable, "hook", "hermes", event], input=json.dumps(payload), text=True,
            capture_output=True, timeout=timeout, env=env, check=False,
        )
        if proc.returncode != 0 or len(proc.stdout) > _MAX_CAPTURE:
            return None
        text = proc.stdout.strip()
        return json.loads(text) if text else {}
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def _pre_tool_call(tool_name: str, args: dict[str, Any], **kwargs: Any) -> dict[str, str] | None:
    payload = {"tool_name": _ALIASES.get(tool_name, tool_name), "tool_input": args,
               "session_id": _sid(kwargs), "cwd": _project(kwargs)}
    response = _run_hook("pretooluse", payload)
    # Hermes' public pre_tool_call API supports veto, not argument rewriting.
    if response and response.get("hookSpecificOutput", {}).get("permissionDecision") == "deny":
        return {"action": "block", "message": str(response["hookSpecificOutput"].get("permissionDecisionReason") or "Blocked by context-mode routing")}
    return None


def _post_tool_call(tool_name: str, args: dict[str, Any], result: Any, **kwargs: Any) -> None:
    _run_hook("posttooluse", {"tool_name": _ALIASES.get(tool_name, tool_name),
        "tool_input": args, "tool_response": result, "session_id": _sid(kwargs),
        "cwd": _project(kwargs)})


def _pre_llm_call(**kwargs: Any) -> dict[str, str] | None:
    sid = _sid(kwargs)
    prompt = ""
    if isinstance(kwargs.get("user_message"), str):
        prompt = kwargs["user_message"]
    if prompt:
        _run_hook("userpromptsubmit", {"prompt": prompt, "session_id": sid, "cwd": _project(kwargs)})
    with _state_lock:
        first = sid not in _seen_sessions or bool(kwargs.get("is_first_turn"))
        _seen_sessions.add(sid)
    source = "compact" if kwargs.get("compaction_applied") else ("startup" if first else None)
    if source:
        response = _run_hook("sessionstart", {"source": source, "session_id": sid, "cwd": _project(kwargs)})
        context = response.get("hookSpecificOutput", {}).get("additionalContext") if response else None
        if isinstance(context, str) and context:
            return {"system_context": context}
    return None


def _session_boundary(source: str, **kwargs: Any) -> None:
    sid = _sid(kwargs)
    if source in {"resume", "clear"}:
        _run_hook("sessionstart", {"source": source, "session_id": sid, "cwd": _project(kwargs)})
    else:
        _run_hook("stop", {"session_id": sid, "cwd": _project(kwargs)})
    if source in {"clear", "finalize"}:
        with _state_lock: _seen_sessions.discard(sid)


def _dispatch_index(args: dict[str, Any]) -> Any:
    """Bound one MCP index dispatch without accumulating abandoned workers."""
    if _ctx is None or not _index_lock.acquire(blocking=False):
        return None
    done = threading.Event()
    outcome: dict[str, Any] = {}
    ctx = _ctx

    def run() -> None:
        try:
            outcome["value"] = ctx.dispatch_tool(_CTX_PREFIX + "index", args)
        except Exception as exc:
            outcome["error"] = exc
        finally:
            _index_lock.release()
            done.set()

    threading.Thread(target=run, name="context-mode-index", daemon=True).start()
    if not done.wait(_INDEX_TIMEOUT) or "error" in outcome:
        return None
    return outcome.get("value")


def _transform(tool_name: str, result: Any, **kwargs: Any) -> str | None:
    if _ctx is None or tool_name.startswith(_CTX_PREFIX) or tool_name not in _RESULT_TOOLS:
        return None
    text = result if isinstance(result, str) else json.dumps(result, default=str)
    if len(text.encode("utf-8")) < _INDEX_THRESHOLD:
        return None
    call_id = str(kwargs.get("tool_call_id") or uuid.uuid4().hex)
    source = f"hermes:{tool_name}:{_sid(kwargs)}:{call_id}"
    try:
        indexed = _dispatch_index({"content": text, "source": source})
        parsed = json.loads(indexed) if isinstance(indexed, str) else indexed
        if not isinstance(parsed, dict) or parsed.get("isError") or parsed.get("error") or parsed.get("success") is False:
            return None
        confirmed = parsed.get("success") is True
        if not confirmed and isinstance(parsed.get("content"), list):
            confirmed = any("Indexed " in str(item.get("text", "")) for item in parsed["content"] if isinstance(item, dict))
        if not confirmed:
            return None
    except Exception:
        return None
    return f'[context-mode: indexed {len(text.encode("utf-8"))} bytes from {tool_name} as source "{source}". Use mcp__context_mode__ctx_search to retrieve details.]'


def _command(tool: str, raw_args: str = "") -> str:
    args = {"queries": [raw_args]} if tool == "search" else {}
    return _ctx.dispatch_tool(_CTX_PREFIX + tool, args)


def register(ctx: Any) -> None:
    global _ctx
    _ctx = ctx
    ctx.register_hook("pre_tool_call", _pre_tool_call)
    ctx.register_hook("post_tool_call", _post_tool_call)
    ctx.register_hook("pre_llm_call", _pre_llm_call)
    # on_session_end is the canonical once-per-run turn boundary, avoiding
    # duplicate Stop events from post_llm_call.
    ctx.register_hook("on_session_end", lambda **kw: _session_boundary("turn", **kw))
    ctx.register_hook("on_session_finalize", lambda **kw: _session_boundary("finalize", **kw))
    ctx.register_hook("on_session_reset", lambda **kw: _session_boundary("clear", **kw))
    ctx.register_hook("transform_tool_result", _transform)
    ctx.register_command("ctx-stats", lambda raw_args="": _command("stats", raw_args), "Show context-mode statistics")
    ctx.register_command("ctx-doctor", lambda raw_args="": _command("doctor", raw_args), "Run context-mode diagnostics")
    ctx.register_command("ctx-search", lambda raw_args="": _command("search", raw_args), "Search indexed context", "<query>")
