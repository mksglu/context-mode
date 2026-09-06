"""Behavioral tests for the Hermes Context Mode plugin.

Run with: python -m pytest tests/adapters/hermes_test.py -q
"""

from __future__ import annotations

import importlib.util
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest


@pytest.fixture
def plugin(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    path = Path(__file__).parents[2] / ".hermes-plugin" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        f"hermes_context_mode_{os.urandom(6).hex()}", path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def call_terminal(plugin, command: str, session_id: str = "session"):
    return plugin.pre_tool_call(
        tool_name="terminal",
        args={"command": command},
        task_id="task",
        session_id=session_id,
    )


def test_register_declares_current_hermes_hooks(plugin):
    class Context:
        def __init__(self):
            self.hooks = {}

        def register_hook(self, name, callback):
            self.hooks[name] = callback

    ctx = Context()
    plugin.register(ctx)
    assert set(ctx.hooks) == {
        "pre_tool_call",
        "transform_tool_result",
        "pre_llm_call",
        "on_session_start",
        "on_session_end",
        "on_session_finalize",
    }


@pytest.mark.parametrize("command", [
    "curl https://example.com/data",
    "wget https://example.com/data",
    "git status && curl https://example.com/data",
    "npm test",
    "cargo check",
])
def test_disallowed_terminal_commands_block(plugin, command):
    result = call_terminal(plugin, command)
    assert result is not None
    assert result["action"] == "block"
    assert isinstance(result["message"], str) and result["message"]
    assert "mcp__context_mode__ctx_" in result["message"]


@pytest.mark.parametrize("command", [
    "git status",
    "pwd",
    "mkdir output",
    "npm install",
])
def test_allowlisted_or_bounded_commands_pass(plugin, command):
    assert call_terminal(plugin, command) is None


@pytest.mark.parametrize("command", [
    'python -c "requests.get(\'https://example.com\')"',
    'node -e "fetch(\'https://example.com\')"',
    "Invoke-WebRequest https://example.com",
])
def test_inline_http_blocks(plugin, command):
    result = call_terminal(plugin, command)
    assert result is not None and result["action"] == "block"
    assert "ctx_fetch_and_index" in result["message"]


def test_non_terminal_tool_passes(plugin):
    assert plugin.pre_tool_call(
        tool_name="read_file",
        args={"path": "README.md"},
        task_id="task",
    ) is None


def test_first_turn_guidance_uses_current_hermes_mcp_names(plugin):
    result = plugin.pre_llm_call(
        session_id="first", user_message="hello", is_first_turn=True
    )
    assert result is not None
    assert "mcp__context_mode__ctx_execute" in result["context"]


def test_guidance_is_not_reinjected_later(plugin):
    plugin.pre_llm_call(
        session_id="repeat", user_message="first", is_first_turn=True
    )
    assert plugin.pre_llm_call(
        session_id="repeat", user_message="later", is_first_turn=False
    ) is None
    assert plugin.pre_llm_call(
        session_id="repeat", user_message="first flag again", is_first_turn=True
    ) is None


def test_guidance_state_is_bounded_at_exact_cap(plugin):
    for index in range(plugin._GUIDANCE_CAP + 50):
        plugin.pre_llm_call(
            session_id=f"session-{index}",
            user_message="hello",
            is_first_turn=True,
        )
    assert len(plugin.SESSION_GUIDANCE_SHOWN) == plugin._GUIDANCE_CAP
    assert "session-0" not in plugin.SESSION_GUIDANCE_SHOWN
    assert f"session-{plugin._GUIDANCE_CAP + 49}" in plugin.SESSION_GUIDANCE_SHOWN


def test_guidance_cap_is_thread_safe(plugin):
    def inject(index: int):
        return plugin.pre_llm_call(
            session_id=f"parallel-{index}",
            user_message="hello",
            is_first_turn=True,
        )

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(inject, range(plugin._GUIDANCE_CAP + 100)))
    assert len(plugin.SESSION_GUIDANCE_SHOWN) <= plugin._GUIDANCE_CAP


def test_small_output_is_unchanged(plugin):
    assert plugin.transform_tool_result(
        tool_name="terminal",
        args={"command": "echo hello"},
        result="hello",
        session_id="small",
        task_id="task",
    ) is None


def test_large_utf8_output_is_sandboxed_losslessly(plugin):
    content = "λ🙂<xml>&\n" * 800
    result = plugin.transform_tool_result(
        tool_name="terminal",
        args={"command": "produce output"},
        result=content,
        session_id="large",
        task_id="task",
    )
    assert result is not None and "<sandboxed_output" in result
    files = list(plugin.SANDBOX_DIR.glob("*.txt"))
    assert len(files) == 1
    assert files[0].read_text(encoding="utf-8") == content
    assert "&lt;xml&gt;&amp;" in result


def test_parallel_sandbox_writes_have_unique_names(plugin):
    content = "x" * 5000

    def sandbox(_index: int):
        return plugin.transform_tool_result(
            tool_name="terminal",
            args={"command": "produce output"},
            result=content,
            session_id="parallel-output",
            task_id="same-task",
        )

    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(sandbox, range(48)))
    assert len(list(plugin.SANDBOX_DIR.glob("*.txt"))) == 48


def test_turn_end_persists_without_destroying_session_state(plugin):
    session_id = "multi-turn"
    plugin.on_session_start(session_id=session_id, model="model", platform="cli")
    call_terminal(plugin, "curl https://example.com", session_id)
    plugin.on_session_end(session_id=session_id, completed=True, interrupted=False)
    assert session_id in plugin._session_stats
    call_terminal(plugin, "wget https://example.com", session_id)
    plugin.on_session_end(session_id=session_id, completed=True, interrupted=False)

    with sqlite3.connect(plugin.METRICS_DB) as conn:
        row = conn.execute(
            "SELECT tool_calls, blocks FROM session_metrics WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    assert row == (2, 2)


def test_finalize_persists_then_releases_session_state(plugin):
    session_id = "finalize"
    plugin.on_session_start(session_id=session_id, model="model", platform="cli")
    plugin.pre_llm_call(
        session_id=session_id, user_message="hello", is_first_turn=True
    )
    plugin.on_session_finalize(session_id=session_id, platform="cli")
    assert session_id not in plugin._session_stats
    assert session_id not in plugin.SESSION_GUIDANCE_SHOWN
    with sqlite3.connect(plugin.METRICS_DB) as conn:
        row = conn.execute(
            "SELECT session_id FROM session_metrics WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    assert row == (session_id,)
