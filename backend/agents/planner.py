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


def apply_modification(spec: RobotSpec, modification: str) -> RobotSpec:
    """Keyword fallback for 'tweak it' requests. Keeps the template and task unless asked otherwise."""
    m = modification.lower()
    s = spec.model_copy(deep=True)
    if any(k in m for k in ("cheaper", "budget", "less expensive", "cost")):
        s.constraints.budget_usd = round(s.constraints.budget_usd * 0.7)
    if any(k in m for k in ("faster", "quicker", "speed")):
        s.params.wheel_diameter_mm = min(100, s.params.wheel_diameter_mm + 20)
    if any(k in m for k in ("smaller", "compact", "tiny", "lower", "shorter", "flatter")):
        s.params.chassis_length_mm = max(120, s.params.chassis_length_mm * 0.8)
        s.params.chassis_width_mm = max(100, s.params.chassis_width_mm * 0.8)
        s.params.chassis_height_mm = max(25, s.params.chassis_height_mm * 0.8)
        s.constraints.max_height_mm = min(s.constraints.max_height_mm, s.params.chassis_height_mm + s.params.wheel_diameter_mm / 2 + 20)
    if any(k in m for k in ("bigger", "larger", "wider", "stronger", "heavier load", "carry more")):
        s.params.chassis_length_mm = min(300, s.params.chassis_length_mm * 1.2)
        s.params.chassis_width_mm = min(250, s.params.chassis_width_mm * 1.2)
        s.constraints.max_mass_kg = round(s.constraints.max_mass_kg * 1.3, 1)
    if "camera" in m and ("add" in m or "with" in m) and "camera" not in s.sensors:
        s.sensors.append("camera")
    if ("no camera" in m or "remove the camera" in m or "without camera" in m) and "camera" in s.sensors:
        s.sensors.remove("camera")
    if any(k in m for k in ("tof", "distance sensor", "lidar", "obstacle sensor")) and not any(x.startswith("tof") for x in s.sensors):
        s.sensors.append("tof_front")
    if any(k in m for k in ("arm", "gripper", "grab", "pick up")) and s.template != "mecanum_arm":
        s.template = "mecanum_arm"
        s.params.arm_reach_mm = s.params.arm_reach_mm or 150
    if any(k in m for k in ("longer runtime", "battery life", "run longer", "more battery")):
        s.constraints.target_runtime_min = round(s.constraints.target_runtime_min * 1.5)
    s.rationale = f"revision of previous design: {modification}"
    return s


async def plan(run_id: str, prompt: str, previous: RobotSpec | None = None, modification: str | None = None) -> RobotSpec:
    try:
        user = f"Robot idea: {prompt}"
        if previous and modification:
            user = (f"The user already has this robot design:\n{previous.model_dump_json(indent=1)}\n\n"
                    f"They texted this change request: \"{modification}\"\n"
                    f"Produce the revised RobotSpec. Keep everything they did not ask to change. Say what changed in `rationale`.")
        spec = await llm.structured(llm.load_prompt("planner", run_id=run_id), user, RobotSpec, model=config.PLANNER_MODEL)
        spec.run_id = run_id
        spec.user_prompt = prompt
        if spec.template == "mecanum_arm" and spec.params.arm_reach_mm is None:
            spec.params.arm_reach_mm = 150
        return spec
    except Exception as e:
        log.warning("planner LLM failed, heuristic fallback: %s", e)
        if previous and modification:
            s = apply_modification(previous, modification)
            s.run_id, s.user_prompt = run_id, prompt
            return s
        return heuristic_plan(run_id, prompt)
