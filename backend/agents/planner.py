from __future__ import annotations

import logging

import config
import llm
from models import Constraints, Params, RobotSpec, TaskSpec

log = logging.getLogger("agent.planner")


def heuristic_plan(run_id: str, prompt: str) -> RobotSpec:
    """Keyword fallback. Always produces a valid spec."""
    p = prompt.lower()
    grab = any(k in p for k in ("fetch", "grab", "pick", "keys", "gripper", "arm", "carry", "collect", "retrieve"))
    under = any(k in p for k in ("under", "beneath", "couch", "bed", "sofa"))
    ramp = any(k in p for k in ("ramp", "climb", "stairs", "hill", "slope"))
    tight = any(k in p for k in ("tight", "narrow", "omni", "sideways", "precise", "warehouse"))
    # ramps need real rolling contact; the mecanum planar approximation cannot climb, so ramp wins over "tight"
    template = "mecanum_arm" if grab else ("mecanum_base" if (tight or under) and not ramp else "diff_drive_rover")
    if under:
        task = TaskSpec(id="fetch_under_obstacle", description="drive under a 100 mm couch, reach the red target, return",
                        scene="couch_clearance", success={"reach_target": True, "max_time_s": 20, "no_collision_with": ["couch_underside"], "return_home": True})
    elif ramp:
        task = TaskSpec(id="ramp_climb", description="climb a 12 degree ramp", scene="ramp")
    elif grab:
        task = TaskSpec(id="pick_and_place", description="move the red block into the bin", scene="table_bin")
    else:
        task = TaskSpec(id="drive_loop", description="2 m loop around 3 obstacles", scene="obstacle_course",
                        success={"reach_target": True, "max_time_s": 20, "no_collision_with": ["obs_1", "obs_2", "obs_3"]})
    cons = Constraints(max_height_mm=100 if under else 150)
    params = Params(chassis_length_mm=200, chassis_width_mm=160, chassis_height_mm=60, wheel_diameter_mm=60,
                    arm_reach_mm=150 if template == "mecanum_arm" else None)
    sensors = ["imu", "camera"] + (["tof_front"] if under or tight else [])
    return RobotSpec(run_id=run_id, user_prompt=prompt, template=template,
                     rationale=f"heuristic: {'manipulation' if grab else 'driving'} task -> {template}",
                     constraints=cons, params=params, sensors=sensors, task=task)


async def plan(run_id: str, prompt: str) -> RobotSpec:
    try:
        spec = await llm.structured(llm.load_prompt("planner", run_id=run_id), f"Robot idea: {prompt}", RobotSpec,
                                    model=config.PLANNER_MODEL)
        spec.run_id = run_id
        spec.user_prompt = prompt
        if spec.template == "mecanum_arm" and spec.params.arm_reach_mm is None:
            spec.params.arm_reach_mm = 150
        return spec
    except Exception as e:
        log.warning("planner LLM failed, heuristic fallback: %s", e)
        return heuristic_plan(run_id, prompt)
