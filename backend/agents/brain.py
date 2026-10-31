from __future__ import annotations

import logging
import re
from pathlib import Path

import llm
from models import ControllerArtifact, RobotSpec
from sim.controllers_fallback import load_source
from sim.sandbox import static_check

log = logging.getLogger("agent.brain")


async def write_controller(spec: RobotSpec, robot_info: dict, out_dir: Path, url_for, revision: str = "",
                           previous: str | None = None) -> ControllerArtifact:
    fallback = load_source(spec.template)
    src, origin, ok, msg = fallback, "fallback", True, "fallback controller"
    try:
        rev = f"\nREVISION from critic (must apply): {revision}\nPrevious controller:\n```python\n{previous}\n```" if revision else ""
        user = f"SPEC:\n{spec.model_dump_json(indent=1)}\nrobot_info: {robot_info}\nReference fallback controller for this template:\n```python\n{fallback}\n```"
        out = await llm.text(llm.load_prompt("brain", revision=rev), user)
        m = re.search(r"```python\s*(.*?)```", out, re.S)
        cand = m.group(1) if m else out
        ok, msg = static_check(cand)
        if ok:
            src, origin = cand, "llm"
        else:
            log.warning("brain static check failed: %s", msg)
    except Exception as e:
        log.warning("brain LLM failed, fallback controller: %s", e)
        msg = str(e)
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "controller.py"
    p.write_text(src)
    return ControllerArtifact(source=src, origin=origin, controller_url=url_for(p), static_check_ok=ok, static_check_msg=msg)
