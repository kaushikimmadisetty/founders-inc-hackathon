import math


class Controller:
    def __init__(self, robot_info):
        self.info = robot_info
        self.vmax = robot_info.get("max_wheel_rad_s", 20.0)
        self.k_head = 3.0
        self.k_dist = 8.0

    def step(self, obs, t):
        rel = obs.get("target_rel")
        if rel is None:
            return {"wheel_vel": [0.0, 0.0], "gripper": 0.0}
        dx, dy = rel
        dist = math.hypot(dx, dy)
        heading = math.atan2(dy, dx)
        if dist < 0.03:
            return {"wheel_vel": [0.0, 0.0], "gripper": 1.0}
        speed = self.vmax * max(0.4, min(1.0, dist / 0.15))  # brake only in the last 15 cm
        fwd = speed * max(0.0, math.cos(heading))
        turn = self.k_head * heading * self.vmax / 4.0
        l = max(-self.vmax, min(self.vmax, fwd - turn))
        r = max(-self.vmax, min(self.vmax, fwd + turn))
        return {"wheel_vel": [l, r], "gripper": 1.0 if dist < 0.05 else 0.0}
