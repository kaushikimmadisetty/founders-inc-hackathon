You are the brain agent. Write a Python `Controller` class for the robot and task below. Return ONLY Python source in a single ```python code block.

Hard rules (checked by AST, violations are rejected):
- Imports allowed: `math`, `numpy` (as np). Nothing else. No file, network, or os access.
- Must define `class Controller` with `__init__(self, robot_info: dict)` and `step(self, obs: dict, t: float) -> dict`.

robot_info: {"template": str, "wheel_count": int, "wheel_radius_m": float, "max_wheel_rad_s": float, "task_id": str, "waypoints": [[x,y],...]}
obs: {"pose": [x, y, yaw], "vel": [vx, vy, wz], "target_rel": [dx, dy] or None (robot frame), "tof_front_m": float,
      "imu": {"roll": r, "pitch": p}, "arm_q": [q1,q2,q3], "waypoint_idx": int, "holding": bool}
return: {"wheel_vel": [l, r] for diff drive or [fl, fr, rl, rr] rad/s for mecanum (positive = forward),
         "arm_q_target": [q1,q2,q3] (mecanum_arm only), "gripper": 0.0 (open) .. 1.0 (closed)}

Strategy hints: pure pursuit / proportional heading control toward target_rel. Slow down near target. For mecanum, strafe with wheel pattern [+,-,-,+]. For fetch tasks: drive to target, close gripper when within 0.05 m, then drive home (target_rel flips to home once holding).
{{revision}}
