"""Headless GIF rendering. EGL by default, falls back to OSMesa then to a
placeholder PNG-sequence GIF so the pipeline never dies on a missing GL."""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

log = logging.getLogger("render")


def _try_renderer(model, w, h):
    import mujoco
    # MUJOCO_GL is fixed at import time (config.py picks egl on Linux, cgl on macOS).
    try:
        return mujoco.Renderer(model, height=h, width=w), os.environ.get("MUJOCO_GL")
    except Exception as e:  # noqa
        log.warning("renderer %s failed: %s", os.environ.get("MUJOCO_GL"), e)
        return None, None


def render_gif(model, frames_qpos: list[np.ndarray], out: Path, fps: int = 15, width: int = 320, height: int = 240,
               track_body: str = "chassis") -> Path | None:
    import imageio.v2 as imageio
    import mujoco
    renderer, gl = _try_renderer(model, width, height)
    out.parent.mkdir(parents=True, exist_ok=True)
    data = mujoco.MjData(model)
    cam = mujoco.MjvCamera()
    cam.type = mujoco.mjtCamera.mjCAMERA_TRACKING
    cam.trackbodyid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, track_body)
    cam.distance, cam.elevation, cam.azimuth = 1.6, -25, 135
    imgs = []
    if renderer is None:
        # placeholder: top-down dot plot so the demo still returns a GIF
        from PIL import Image, ImageDraw
        for q in frames_qpos[:: max(1, len(frames_qpos) // 60)]:
            im = Image.new("RGB", (width, height), (30, 30, 36))
            d = ImageDraw.Draw(im)
            x, y = q[0], q[1]
            px, py = int(width * 0.15 + x * 100), int(height / 2 - y * 100)
            d.ellipse([px - 6, py - 6, px + 6, py + 6], fill=(60, 140, 240))
            d.text((6, 6), "no GL renderer; trajectory view", fill=(255, 255, 255))
            imgs.append(np.asarray(im))
    else:
        for q in frames_qpos:
            data.qpos[:] = q
            mujoco.mj_forward(model, data)
            renderer.update_scene(data, camera=cam)
            imgs.append(renderer.render().copy())
        renderer.close()
    imageio.mimsave(out, imgs, duration=1 / fps, loop=0)
    return out
