"""Pydantic data contracts. Source of truth for every agent boundary.
Mirror changes in web/lib/types.ts."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

Template = Literal["diff_drive_rover", "mecanum_base", "mecanum_arm"]
TaskId = Literal["drive_loop", "fetch_under_obstacle", "ramp_climb", "pick_and_place"]
AgentName = Literal["planner", "parts", "body", "board", "brain", "assembler", "sim", "critic"]
FailureClass = Literal[
    "geometry_collision",
    "motor_stall",
    "motor_saturation",
    "tip_over",
    "battery_depleted",
    "over_budget",
    "over_mass",
    "task_timeout",
    "missed_target",
    "pcb_does_not_fit",
    "controller_error",
    "none",
]
RouteTo = Literal["parts", "body", "board", "brain", "none"]
RunStatus = Literal["planning", "building", "simulating", "revising", "passed", "failed"]

TEMPLATE_WHEEL_COUNT: dict[str, int] = {
    "diff_drive_rover": 2,
    "mecanum_base": 4,
    "mecanum_arm": 4,
}


# --------------------------------------------------------------------------- spec
class Constraints(BaseModel):
    max_height_mm: float = 150
    max_footprint_mm: tuple[float, float] = (250, 200)
    max_mass_kg: float = 2.5
    target_runtime_min: float = 30
    budget_usd: float = 150


class Params(BaseModel):
    chassis_length_mm: float = 200
    chassis_width_mm: float = 160
    chassis_height_mm: float = 60
    wheel_diameter_mm: float = 60
    arm_reach_mm: Optional[float] = None


class SuccessCriteria(BaseModel):
    reach_target: bool = True
    max_time_s: float = 20
    no_collision_with: list[str] = Field(default_factory=list)
    return_home: bool = False


class TaskSpec(BaseModel):
    id: TaskId
    description: str
    scene: str
    success: SuccessCriteria = Field(default_factory=SuccessCriteria)


class RobotSpec(BaseModel):
    run_id: str
    user_prompt: str
    template: Template
    rationale: str
    constraints: Constraints = Field(default_factory=Constraints)
    params: Params = Field(default_factory=Params)
    sensors: list[str] = Field(default_factory=lambda: ["imu"])
    task: TaskSpec

    @property
    def wheel_count(self) -> int:
        return TEMPLATE_WHEEL_COUNT[self.template]


# --------------------------------------------------------------------------- parts
PartRole = Literal[
    "mcu", "drive_motor", "motor_driver", "battery", "regulator",
    "camera", "imu", "tof", "servo", "wheel", "caster", "gripper",
]


class Part(BaseModel):
    role: PartRole
    qty: int = 1
    name: str
    mass_g: float
    stall_torque_nm: Optional[float] = None
    rated_rpm: Optional[float] = None
    stall_current_a: Optional[float] = None
    capacity_mah: Optional[float] = None
    voltage_v: Optional[float] = None
    dims_mm: tuple[float, float, float] = (0, 0, 0)
    unit_price_usd: float
    url: str = ""
    source: Literal["firecrawl", "catalog"] = "catalog"   # firecrawl = price verified live on the store page
    sku: Optional[str] = None
    in_stock: Optional[bool] = None
    vendor: Optional[str] = None
    catalog_price_usd: Optional[float] = None               # what we assumed before the live check


class PartsSelection(BaseModel):
    parts: list[Part]
    total_usd: float = 0
    total_mass_g: float = 0

    def recompute(self) -> "PartsSelection":
        self.total_usd = round(sum(p.unit_price_usd * p.qty for p in self.parts), 2)
        self.total_mass_g = round(sum(p.mass_g * p.qty for p in self.parts), 1)
        return self

    def by_role(self, role: str) -> Optional[Part]:
        return next((p for p in self.parts if p.role == role), None)


# --------------------------------------------------------------------------- body
class MountPoints(BaseModel):
    pcb: list[tuple[float, float]] = Field(default_factory=list)
    motors: list[tuple[float, float, float]] = Field(default_factory=list)
    camera: Optional[tuple[float, float, float]] = None


class BodyArtifact(BaseModel):
    chassis_stl_url: Optional[str] = None
    chassis_step_url: Optional[str] = None
    dims_mm: tuple[float, float, float]
    wheel_diameter_mm: float
    mount_points: MountPoints = Field(default_factory=MountPoints)
    chassis_mass_g: float
    mjcf_fragment: str = ""


# --------------------------------------------------------------------------- board
class BomLine(BaseModel):
    ref: str
    part: str
    qty: int
    unit_price_usd: float


class BoardArtifact(BaseModel):
    provider: Literal["heypcb", "fallback"]
    outline_mm: tuple[float, float]
    mount_holes_mm: list[tuple[float, float]]
    bom_lines: list[BomLine] = Field(default_factory=list)
    render_png_url: Optional[str] = None
    gerbers_zip_url: Optional[str] = None
    enclosure_stl_url: Optional[str] = None


# --------------------------------------------------------------------------- brain
class ControllerArtifact(BaseModel):
    source: str
    origin: Literal["llm", "fallback"]
    controller_url: Optional[str] = None
    static_check_ok: bool = True
    static_check_msg: str = ""


# --------------------------------------------------------------------------- sim
class SimMetrics(BaseModel):
    time_s: float = 0
    reached_target: bool = False
    min_clearance_mm: float = 1e9
    max_tilt_deg: float = 0
    energy_wh: float = 0
    motor_saturation_pct: float = 0
    collisions: list[str] = Field(default_factory=list)
    total_mass_kg: float = 0
    total_cost_usd: float = 0


class SimReport(BaseModel):
    iteration: int
    passed: bool
    metrics: SimMetrics
    failure_class: FailureClass = "none"
    failure_detail: str = ""
    route_to: RouteTo = "none"
    gif_url: Optional[str] = None
    trajectory_url: Optional[str] = None
    mjcf_url: Optional[str] = None


class CriticVerdict(BaseModel):
    failure_class: FailureClass
    route_to: RouteTo
    instruction: str
    summary: str  # one line for UI callout


# --------------------------------------------------------------------------- run
class RunCreate(BaseModel):
    prompt: str
    source: Literal["imessage", "web"] = "web"
    phone: Optional[str] = None
    parent_run_id: Optional[str] = None   # set to revise an earlier robot instead of starting fresh


class RunState(BaseModel):
    run_id: str
    prompt: str
    source: str
    phone: Optional[str] = None
    parent_run_id: Optional[str] = None
    modification: Optional[str] = None     # the user's change request when this run revises a parent
    status: RunStatus = "planning"
    iteration: int = 0
    spec: Optional[RobotSpec] = None
    parts: Optional[PartsSelection] = None
    body: Optional[BodyArtifact] = None
    board: Optional[BoardArtifact] = None
    brain: Optional[ControllerArtifact] = None
    reports: list[SimReport] = Field(default_factory=list)
    critic_history: list[CriticVerdict] = Field(default_factory=list)
    error: Optional[str] = None
