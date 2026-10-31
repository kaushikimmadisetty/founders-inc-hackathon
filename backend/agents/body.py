from __future__ import annotations

import logging
from pathlib import Path

import llm
from cad.chassis import build_chassis
from sim.assembler import top_stack_mm
from models import BodyArtifact, PartsSelection, RobotSpec
from pydantic import BaseModel

log = logging.getLogger("agent.body")


class BodyDecision(BaseModel):
    chassis_length_mm: float
    chassis_width_mm: float
    chassis_height_mm: float
    wheel_diameter_mm: float
    notes: str = ""


def heuristic_decision(spec: RobotSpec, parts: PartsSelection, revision: str) -> BodyDecision:
    p = spec.params
    L, W, H, wd = p.chassis_length_mm, p.chassis_width_mm, p.chassis_height_mm, p.wheel_diameter_mm
    wheel = parts.by_role("wheel")
    if wheel:
        wd = wheel.dims_mm[0]
    cam_h = top_stack_mm(spec, parts)
    if revision:  # critic asked for a fix: shrink to fit clearance with 10 mm margin
        budget = spec.constraints.max_height_mm - 10 - wd / 2 - cam_h
        H = max(25.0, min(H, budget))
        if "wider" in revision.lower():
            W *= 1.2
    return BodyDecision(chassis_length_mm=L, chassis_width_mm=W, chassis_height_mm=round(H, 1), wheel_diameter_mm=wd,
                        notes=f"total height ~{H + wd / 2 + cam_h:.0f} mm")


async def design_body(spec: RobotSpec, parts: PartsSelection, pcb_outline: tuple[float, float], out_dir: Path, url_for,
                      revision: str = "") -> BodyArtifact:
    dec = heuristic_decision(spec, parts, revision)
    try:
        rev = f"\nREVISION from critic (must apply): {revision}" if revision else ""
        user = f"SPEC:\n{spec.model_dump_json(indent=1)}\nPARTS:\n{parts.model_dump_json()}\nPCB outline mm: {pcb_outline}\nStarting point: {dec.model_dump_json()}"
        llm_dec = await llm.structured(llm.load_prompt("body", revision=rev), user, BodyDecision)
        # sanity clamp
        if 80 <= llm_dec.chassis_length_mm <= 400 and 60 <= llm_dec.chassis_width_mm <= 350 and 20 <= llm_dec.chassis_height_mm <= 200:
            dec = llm_dec
    except Exception as e:
        log.warning("body LLM failed, heuristic: %s", e)
    spec.params.chassis_length_mm = dec.chassis_length_mm
    spec.params.chassis_width_mm = dec.chassis_width_mm
    spec.params.chassis_height_mm = dec.chassis_height_mm
    spec.params.wheel_diameter_mm = dec.wheel_diameter_mm
    art = build_chassis(spec, parts.by_role("wheel"), parts.by_role("battery"), parts.by_role("drive_motor"), pcb_outline, out_dir, url_for)
    return art
