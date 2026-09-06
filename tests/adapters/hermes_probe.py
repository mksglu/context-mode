"""Dependency-free bridge used by the cross-platform Vitest suite."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path


def load_plugin():
    os.environ["HERMES_HOME"] = tempfile.mkdtemp(prefix="context-mode-hermes-probe-")
    path = Path(__file__).parents[2] / ".hermes-plugin" / "__init__.py"
    spec = importlib.util.spec_from_file_location("hermes_context_mode_probe", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import plugin from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    request = json.loads(sys.stdin.read())
    plugin = load_plugin()
    operation = request["operation"]

    if operation == "pre_tool_call":
        result = plugin.pre_tool_call(
            tool_name=request.get("tool_name", "terminal"),
            args={"command": request.get("command", "")},
            task_id="probe",
            session_id="probe-session",
        )
    elif operation == "guidance_sequence":
        first = plugin.pre_llm_call(
            session_id="probe-session",
            user_message="first",
            is_first_turn=True,
        )
        later = plugin.pre_llm_call(
            session_id="probe-session",
            user_message="later",
            is_first_turn=False,
        )
        repeated = plugin.pre_llm_call(
            session_id="probe-session",
            user_message="repeated",
            is_first_turn=True,
        )
        result = {"first": first, "later": later, "repeated": repeated}
    else:
        raise ValueError(f"Unknown operation: {operation}")

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
