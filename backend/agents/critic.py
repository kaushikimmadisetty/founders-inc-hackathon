from __future__ import annotations

import logging

import config
import llm
from models import CriticVerdict, RunState, SimReport

log = logging.getLogger("agent.critic")

ROUTE = {"geometry_collision": "body", "tip_over": "body", "motor_stall": "parts", "motor_saturation": "parts",
         "battery_depleted": "parts", "over_budget": "parts", "over_mass": "parts", "task_timeout": "brain",
         "missed_target": "brain", "controller_error": "brain", "pcb_does_not_fit": "board", "none": "none"}


def heuristic_verdict(state: RunState, report: SimReport) -> CriticVerdict:
    fc = report.failure_class
    route = ROUTE.get(fc, "brain")
    spec = state.spec
    if fc == "geometry_collision" and spec and "underside" in report.failure_detail:
        target = spec.constraints.max_height_mm - 10
        instr = (f"Reduce total robot height to under {target:.0f} mm. Lower chassis_height_mm and prefer a low profile camera; "
                 f"current failure: {report.failure_detail}")
        summary = f"Too tall for {spec.constraints.max_height_mm:.0f} mm clearance. Body agent shrinking chassis, parts agent swapping to a low profile camera."
    elif fc in ("motor_saturation", "motor_stall"):
        instr = "Choose a stronger drive motor (higher stall torque, e.g. 100 RPM N20 or JGA25) for the same voltage."
        summary = "Motors saturated. Parts agent choosing a stronger motor."
    elif fc == "tip_over":
        instr = "Lower centre of mass and make the base wider: mount battery flat on the floor, increase chassis width by 20%."
        summary = "Robot tipped over. Body agent lowering centre of mass and widening base."
    elif fc in ("task_timeout", "missed_target"):
        instr = f"Increase forward gain and reduce slow-down radius so the robot reaches the target faster. Detail: {report.failure_detail}"
        summary = "Too slow to reach the target. Brain agent retuning the controller."
    else:
        instr = f"Fix: {report.failure_detail}"
        summary = f"Failed: {fc}. {route} agent revising."
    return CriticVerdict(failure_class=fc, route_to=route, instruction=instr, summary=summary)


async def critique(state: RunState, report: SimReport) -> CriticVerdict:
    base = heuristic_verdict(state, report)
    try:
        user = (f"SIM REPORT:\n{report.model_dump_json(indent=1)}\n\nSPEC:\n{state.spec.model_dump_json() if state.spec else ''}\n"
                f"PARTS:\n{state.parts.model_dump_json() if state.parts else ''}\nBODY dims mm: {state.body.dims_mm if state.body else ''}")
        v = await llm.structured(llm.load_prompt("critic"), user, CriticVerdict, model=config.PLANNER_MODEL, max_tokens=800)
        if v.route_to == "none":
            return base
        return v
    except Exception as e:
        log.warning("critic LLM failed, heuristic: %s", e)
        return base
