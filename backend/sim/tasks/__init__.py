"""Task library: scene include + success check + waypoints. One entry per TaskId."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TaskDef:
    id: str
    scene_file: str
    start: tuple[float, float]
    waypoints: list[tuple[float, float]]
    target: tuple[float, float]
    forbidden_geoms: list[str] = field(default_factory=list)
    reach_radius_m: float = 0.08
    return_home: bool = False
    needs_arm: bool = False
    clearance_mm: float | None = None  # overhead clearance in scene, for failure explanations
    description: str = ""


TASKS: dict[str, TaskDef] = {
    "drive_loop": TaskDef(
        id="drive_loop", scene_file="scene_obstacle_course.xml", start=(0, 0),
        waypoints=[(0.6, -0.15), (1.2, 0.2), (1.8, -0.1), (2.0, 0.0)], target=(2.0, 0.0),
        forbidden_geoms=["obs_1", "obs_2", "obs_3"], description="2 m loop around 3 obstacles"),
    "fetch_under_obstacle": TaskDef(
        id="fetch_under_obstacle", scene_file="scene_couch_clearance.xml", start=(0, 0),
        waypoints=[(0.5, 0.0), (1.1, 0.0)], target=(1.1, 0.0),
        forbidden_geoms=["couch_underside", "couch_leg_1", "couch_leg_2", "couch_leg_3", "couch_leg_4"],
        return_home=True, clearance_mm=100, description="drive under a 100 mm couch, reach the red target, return"),
    "ramp_climb": TaskDef(
        id="ramp_climb", scene_file="scene_ramp.xml", start=(0, 0),
        waypoints=[(0.5, 0.0), (1.8, 0.0)], target=(1.8, 0.0), reach_radius_m=0.12,
        description="climb a 12 degree ramp onto the platform"),
    "pick_and_place": TaskDef(
        id="pick_and_place", scene_file="scene_table_bin.xml", start=(0, 0),
        waypoints=[(0.35, 0.0)], target=(0.5, 0.33), needs_arm=True, reach_radius_m=0.1,
        forbidden_geoms=["bin_wall_1", "bin_wall_2"],
        description="drive to the block, then park in front of the bin (arm drop sequence is TODO: base-only success for now)"),
}
