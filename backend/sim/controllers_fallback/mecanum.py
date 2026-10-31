import math


class Controller:
    """Omnidirectional: strafe straight at target_rel, hold heading. Arm tucked, gripper closes near target."""

    def __init__(self, robot_info):
        self.info = robot_info
        self.vmax = robot_info.get("max_wheel_rad_s", 20.0)
        self.k = 10.0

    def step(self, obs, t):
        rel = obs.get("target_rel")
        if rel is None:
            return {"wheel_vel": [0.0] * 4, "arm_q_target": [0.0, 0.0, 0.0], "gripper": 0.0}
        dx, dy = rel
        dist = math.hypot(dx, dy)
        speed = self.vmax * max(0.4, min(1.0, dist / 0.15))  # brake only in the last 15 cm
        s = speed / max(dist, 1e-6)
        vx, vy = dx * s, dy * s
        # mecanum inverse kinematics, wheel order fl, fr, rl, rr
        wz = -0.5 * obs["pose"][2] * self.vmax if abs(obs["pose"][2]) > 0.05 else 0.0
        fl = vx - vy - wz
        fr = vx + vy + wz
        rl = vx + vy - wz
        rr = vx - vy + wz
        w = [max(-self.vmax, min(self.vmax, v)) for v in (fl, fr, rl, rr)]
        near = dist < 0.05
        arm = [0.0, 0.9, -0.9] if near else [0.0, 0.0, 0.0]  # flat while driving, reach down near target
        return {"wheel_vel": w, "arm_q_target": arm, "gripper": 1.0 if near else 0.0}
