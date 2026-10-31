"""Builds one MJCF from template + task scene + real part masses/torques."""
from __future__ import annotations

import math
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from models import BodyArtifact, PartsSelection, RobotSpec
from sim.tasks import TASKS

TEMPLATES = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(str(TEMPLATES)), autoescape=False)

RPM_TO_RAD = 2 * math.pi / 60


def drive_limits(parts: PartsSelection, wheel_r: float, n_wheels: int) -> dict:
    m = parts.by_role("drive_motor")
    tau = (m.stall_torque_nm if m and m.stall_torque_nm else 0.08) * 0.8  # usable ~80% of stall
    rpm = (m.rated_rpm if m and m.rated_rpm else 200)
    w_max = rpm * RPM_TO_RAD
    f_max = tau / wheel_r * n_wheels            # total planar force (mecanum approximation)
    t_max = f_max * 0.1                           # yaw torque with ~0.1 m lever
    return {"tau": round(tau, 4), "w_max": round(w_max, 2), "f_max": round(f_max, 2), "t_max": round(t_max, 3)}


ARM_STACK_MM = 32.0  # servo base + folded links above chassis top


def top_stack_mm(spec: RobotSpec, parts: PartsSelection) -> float:
    """Tallest thing mounted on the chassis top (camera or folded arm)."""
    cam = parts.by_role("camera")
    cam_h = cam.dims_mm[2] if cam and "camera" in spec.sensors else 0.0
    arm_h = ARM_STACK_MM if spec.template == "mecanum_arm" else 0.0
    return max(cam_h, arm_h)


def assemble(spec: RobotSpec, parts: PartsSelection, body: BodyArtifact) -> tuple[str, dict]:
    """Return (mjcf_xml, robot_info)."""
    task = TASKS[spec.task.id]
    L, W, H = (d / 1000 for d in body.dims_mm)
    wheel_r = body.wheel_diameter_mm / 2000
    n = spec.wheel_count
    lim = drive_limits(parts, wheel_r, n)

    bat = parts.by_role("battery")
    cam = parts.by_role("camera")
    wheel = parts.by_role("wheel")
    servo = parts.by_role("servo")
    grip = parts.by_role("gripper")

    # non-structural electronics mass lumped into chassis
    lumped_g = body.chassis_mass_g + sum(
        p.mass_g * p.qty for p in parts.parts if p.role not in ("battery", "camera", "wheel", "servo", "gripper", "drive_motor"))
    motors_g = sum(p.mass_g * p.qty for p in parts.parts if p.role == "drive_motor")
    lumped_g += motors_g

    cam_h = (cam.dims_mm[2] / 1000) if cam and "camera" in spec.sensors else 0.0
    bat_dims = [d / 1000 for d in (bat.dims_mm if bat else (60, 30, 15))]
    # clamp battery inside chassis
    bat_dims = [min(bat_dims[0], L * 0.6), min(bat_dims[1], W * 0.8), min(bat_dims[2], H * 0.8)]

    ctx = dict(
        template=spec.template, scene_file=task.scene_file, start=task.start,
        L=L, W=W, H=H, wheel_r=wheel_r, caster_r=min(0.012, wheel_r * 0.5),
        chassis_mass=lumped_g / 1000, cam_h=cam_h, cam_mass=(cam.mass_g / 1000 if cam else 0.005),
        bat=bat_dims, bat_mass=(bat.mass_g / 1000 if bat else 0.06),
        wheel_mass=(wheel.mass_g / 1000 if wheel else 0.02),
        tau=lim["tau"], f_max=lim["f_max"], t_max=lim["t_max"],
        reach=(spec.params.arm_reach_mm or 150) / 1000,
        servo_mass=(servo.mass_g / 1000 if servo else 0.012),
        gripper_mass=(grip.mass_g / 1000 if grip else 0.04),
        servo_kp=(servo.stall_torque_nm * 10 if servo and servo.stall_torque_nm else 2.0),
    )
    xml = _env.get_template(f"{spec.template}.xml.j2").render(**ctx)

    total_mass = sum(p.mass_g * p.qty for p in parts.parts) / 1000 + body.chassis_mass_g / 1000
    robot_info = {
        "template": spec.template, "wheel_count": n, "wheel_radius_m": wheel_r,
        "max_wheel_rad_s": lim["w_max"], "task_id": spec.task.id,
        "waypoints": [list(w) for w in task.waypoints], "total_mass_kg": round(total_mass, 3),
        "total_height_mm": round(H * 1000 + top_stack_mm(spec, parts) + wheel_r * 1000, 1),
        "limits": lim,
        "battery_wh": ((bat.capacity_mah or 1000) / 1000 * (bat.voltage_v or 7.4)) if bat else 7.4,
    }
    return xml, robot_info
