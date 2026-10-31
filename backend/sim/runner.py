"""Headless MuJoCo sim gate. Runs the controller against the task, returns SimReport.
Deterministic (fixed seed, fixed timestep). Cap 20 s sim time."""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import numpy as np

import config
from models import SimMetrics, SimReport
from sim.render import render_gif
from sim.sandbox import instantiate
from sim.tasks import TASKS

log = logging.getLogger("sim")
SIM_CAP_S = 20.0
FPS = 30


def _quat_to_rpy(q):
    w, x, y, z = q
    roll = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    pitch = math.asin(max(-1, min(1, 2 * (w * y - z * x))))
    yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    return roll, pitch, yaw


def run(mjcf_xml: str, controller_src: str, robot_info: dict, iteration: int, out_dir: Path, url_for,
        make_gif: bool = True) -> SimReport:
    import mujoco
    np.random.seed(config.SIM_SEED)
    task = TASKS[robot_info["task_id"]]
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "robot.mjcf").write_text(mjcf_xml)

    model = mujoco.MjModel.from_xml_string(mjcf_xml)
    data = mujoco.MjData(model)
    is_mecanum = robot_info["template"] != "diff_drive_rover"
    wheel_r = robot_info["wheel_radius_m"]
    w_max = robot_info["max_wheel_rad_s"]
    n = robot_info["wheel_count"]

    metrics = SimMetrics(total_mass_kg=robot_info["total_mass_kg"])
    failure, detail = "none", ""

    try:
        ctrl = instantiate(controller_src, robot_info)
    except Exception as e:
        return SimReport(iteration=iteration, passed=False, metrics=metrics, failure_class="controller_error",
                         failure_detail=f"controller failed to instantiate: {e}", route_to="brain")

    chassis_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "chassis")
    forb_ids = {mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, g): g for g in task.forbidden_geoms}
    forb_ids = {k: v for k, v in forb_ids.items() if k >= 0}
    robot_geoms = {i for i in range(model.ngeom) if model.body_rootid[model.geom_bodyid[i]] == model.body_rootid[chassis_id]}
    act_ids = {model.actuator(i).name: i for i in range(model.nu)}
    arm_q_adr = [model.joint(j).qposadr[0] for j in ("arm_q1", "arm_q2", "arm_q3") if mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, j) >= 0]

    dt = model.opt.timestep
    ctrl_dt = 0.02
    frame_dt = 1 / FPS
    frames: list[np.ndarray] = []
    next_frame = 0.0
    next_ctrl = 0.0
    wp_idx, holding, home = 0, False, np.array(task.start, dtype=float)
    target = np.array(task.target, dtype=float)
    sat_samples, sat_hits = 0, 0
    energy_j = 0.0
    min_clear = 1e9
    reached_t = None
    cmd = {"wheel_vel": [0.0] * n}
    t = 0.0

    tof_origin = np.zeros(3); tof_dir = np.zeros(3); tof_geomid = np.zeros(1, dtype=np.int32)
    nose_x = L / 2 + 0.005 if (L := float(model.geom_size[mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "chassis_geom")][0])) else 0.1

    def tof_front() -> float:
        """Real distance sensor: ray from the nose along +x of the chassis, ignoring the robot's own geoms. 2.0 m max."""
        try:
            xy, yaw, _ = pose()
            z = 0.5 * float(model.geom_size[mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "chassis_geom")][2]) + wheel_r
            tof_origin[:] = (xy[0] + math.cos(yaw) * nose_x, xy[1] + math.sin(yaw) * nose_x, z)
            tof_dir[:] = (math.cos(yaw), math.sin(yaw), 0.0)
            d = mujoco.mj_ray(model, data, tof_origin, tof_dir, None, 1, model.body_rootid[chassis_id], tof_geomid)
            return float(min(d, 2.0)) if d >= 0 else 2.0
        except Exception:
            return 2.0

    def pose():
        if is_mecanum:
            qx = data.joint("base_x").qpos[0]; qy = data.joint("base_y").qpos[0]; yaw = data.joint("base_yaw").qpos[0]
            return np.array([qx + task.start[0], qy + task.start[1]]), yaw, (0.0, 0.0)
        p = data.xpos[chassis_id]
        r, pch, yaw = _quat_to_rpy(data.xquat[chassis_id])
        return np.array([p[0], p[1]]), yaw, (r, pch)

    while t < SIM_CAP_S:
        xy, yaw, (roll, pitch) = pose()
        tilt = math.degrees(max(abs(roll), abs(pitch)))
        metrics.max_tilt_deg = max(metrics.max_tilt_deg, tilt)
        if tilt > 60 and not is_mecanum:
            failure, detail = "tip_over", f"tilted {tilt:.0f} deg at t={t:.1f}s"
            break

        # waypoint / target bookkeeping
        goal = target if wp_idx >= len(task.waypoints) else np.array(task.waypoints[wp_idx])
        if holding and task.return_home:
            goal = home
        if np.linalg.norm(xy - goal) < task.reach_radius_m:
            if wp_idx < len(task.waypoints):
                wp_idx += 1
            elif not holding and np.linalg.norm(xy - target) < task.reach_radius_m:
                holding = True
                if not task.return_home:
                    reached_t = t; metrics.reached_target = True; break
            elif holding and task.return_home and np.linalg.norm(xy - home) < task.reach_radius_m + 0.05:
                reached_t = t; metrics.reached_target = True; break

        if t >= next_ctrl:
            d = goal - xy
            c, s = math.cos(-yaw), math.sin(-yaw)
            rel = [c * d[0] - s * d[1], s * d[0] + c * d[1]]
            obs = {"pose": [float(xy[0]), float(xy[1]), float(yaw)], "vel": [0, 0, 0], "target_rel": rel,
                   "tof_front_m": tof_front(), "imu": {"roll": roll, "pitch": pitch},
                   "arm_q": [float(data.qpos[a]) for a in arm_q_adr], "waypoint_idx": wp_idx, "holding": holding}
            try:
                cmd = ctrl.step(obs, t) or cmd
            except Exception as e:
                failure, detail = "controller_error", f"step() raised at t={t:.1f}s: {e}"
                break
            next_ctrl += ctrl_dt

        wv = [float(v) for v in cmd.get("wheel_vel", [0.0] * n)]
        wv = (wv + [0.0] * n)[:n]
        sat_samples += 1
        if any(abs(v) >= w_max * 0.98 for v in wv):
            sat_hits += 1
        if is_mecanum:
            fl, fr, rl, rr = wv
            vx = wheel_r * (fl + fr + rl + rr) / 4
            vy = wheel_r * (-fl + fr + rl - rr) / 4
            wz = wheel_r * (-fl + fr - rl + rr) / (4 * 0.15)
            cy, sy = math.cos(yaw), math.sin(yaw)
            vxw, vyw = cy * vx - sy * vy, sy * vx + cy * vy
            kv = 40.0
            data.ctrl[act_ids["f_x"]] = kv * (vxw - data.joint("base_x").qvel[0])
            data.ctrl[act_ids["f_y"]] = kv * (vyw - data.joint("base_y").qvel[0])
            data.ctrl[act_ids["t_yaw"]] = 2.0 * (wz - data.joint("base_yaw").qvel[0])
            for name, qt in zip(("a1", "a2", "a3"), cmd.get("arm_q_target", [0, 0, 0])):
                if name in act_ids:
                    data.ctrl[act_ids[name]] = float(qt)
        else:
            kp = robot_info["limits"]["tau"] / max(w_max, 1e-3) * 1.5  # full torque only at large speed error, limits wheelspin
            data.ctrl[act_ids["m_l"]] = kp * (wv[0] - data.joint("wheel_l").qvel[0])
            data.ctrl[act_ids["m_r"]] = kp * (wv[1] - data.joint("wheel_r").qvel[0])

        mujoco.mj_step(model, data)
        t += dt
        energy_j += float(np.sum(np.abs(data.actuator_force * data.ctrl))) * dt * 0.05 + 1.5 * dt  # motors + idle electronics

        # contacts with forbidden geoms
        for i in range(data.ncon):
            c1, c2 = data.contact[i].geom1, data.contact[i].geom2
            hit = None
            if c1 in forb_ids and c2 in robot_geoms: hit = forb_ids[c1]
            elif c2 in forb_ids and c1 in robot_geoms: hit = forb_ids[c2]
            if hit and hit not in metrics.collisions:
                metrics.collisions.append(hit)
        if metrics.collisions and failure == "none":
            hit = metrics.collisions[0]
            if task.clearance_mm and "underside" in hit:
                over = robot_info["total_height_mm"] - task.clearance_mm
                failure = "geometry_collision"
                detail = f"robot height {robot_info['total_height_mm']:.0f} mm exceeds {task.clearance_mm:.0f} mm clearance by {over:.0f} mm, hit {hit} at t={t:.1f}s"
            else:
                failure, detail = "geometry_collision", f"collided with {hit} at t={t:.1f}s"
            break

        if task.clearance_mm:
            min_clear = min(min_clear, task.clearance_mm - robot_info["total_height_mm"])

        if t >= next_frame:
            frames.append(data.qpos.copy())
            next_frame += frame_dt

    metrics.time_s = round(t, 2)
    metrics.motor_saturation_pct = round(100 * sat_hits / max(sat_samples, 1), 1)
    metrics.energy_wh = round(energy_j / 3600, 4)
    metrics.min_clearance_mm = round(min_clear, 1) if min_clear < 1e8 else 0.0

    if failure == "none" and not metrics.reached_target:
        dist_left = float(np.linalg.norm(xy - target))
        if metrics.motor_saturation_pct > 85 and (metrics.max_tilt_deg > 15 or dist_left > 0.5):
            failure = "motor_saturation"
            detail = f"motors saturated {metrics.motor_saturation_pct:.0f}% of the run and still {dist_left:.2f} m short (max tilt {metrics.max_tilt_deg:.0f} deg)"
        else:
            failure = "task_timeout" if dist_left > 0.3 else "missed_target"
            detail = f"did not reach target within {SIM_CAP_S:.0f}s, final distance {dist_left:.2f} m"

    route = {"geometry_collision": "body", "tip_over": "body", "motor_saturation": "parts", "motor_stall": "parts",
             "task_timeout": "brain", "missed_target": "brain", "controller_error": "brain", "none": "none"}[failure]

    traj_path = out_dir / "trajectory.json"
    traj_path.write_text(json.dumps({
        "fps": FPS, "template": robot_info["template"], "dims_mm": None,
        "frames": [f.tolist() for f in frames],
        "joint_names": [model.joint(i).name for i in range(model.njnt)],
        "qpos_adr": [int(model.jnt_qposadr[i]) for i in range(model.njnt)],
    }))
    gif_url = None
    if make_gif and frames:
        try:
            gif = render_gif(model, frames[:: 2], out_dir / "run.gif", attempt=iteration)
            gif_url = url_for(gif) if gif else None
        except Exception as e:
            log.warning("gif render failed: %s", e)

    return SimReport(iteration=iteration, passed=failure == "none", metrics=metrics, failure_class=failure,
                     failure_detail=detail, route_to=route, gif_url=gif_url, trajectory_url=url_for(traj_path),
                     mjcf_url=url_for(out_dir / "robot.mjcf"))
