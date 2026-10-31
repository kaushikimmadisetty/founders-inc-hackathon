"""Phone-sized simulation GIFs, with a trajectory fallback when GL is absent."""
from __future__ import annotations

import logging
import math
import os
from pathlib import Path

import numpy as np

log = logging.getLogger("render")


def _try_renderer(model, w, h):
    import mujoco
    try:
        return mujoco.Renderer(model, height=h, width=w), os.environ.get("MUJOCO_GL")
    except Exception as e:
        log.warning("renderer %s failed: %s", os.environ.get("MUJOCO_GL"), e)
        return None, None


def _font(size):
    from PIL import ImageFont
    for name in ("DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def _save_gif(images, out, fps):
    """Quantize first, then reduce frame rate while preserving playback time."""
    from PIL import Image
    stride, colors = 1, 128
    while True:
        indices = list(range(0, len(images), stride))
        if indices[-1] != len(images) - 1:
            indices.append(len(images) - 1)
        frames = [images[i].quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                                     dither=Image.Dither.NONE) for i in indices]
        # GIF timing has 10ms granularity. Round cumulative timestamps to
        # alternate 60/70ms at 15fps instead of speeding up the whole clip.
        boundaries = indices + [len(images)]
        durations = [max(10, round(boundaries[j + 1] * 100 / fps) * 10 - round(i * 100 / fps) * 10)
                     for j, i in enumerate(indices)]
        frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations,
                       loop=0, optimize=True, disposal=2)
        if out.stat().st_size < 2_000_000:
            return
        if colors > 32:
            colors //= 2
        elif len(indices) > 2:
            stride *= 2
        else:
            raise ValueError("GIF exceeds 2 MB even after quantization and frame reduction")


def render_gif(model, frames_qpos: list[np.ndarray], out: Path, fps: int = 15, width: int = 480, height: int = 360,
               track_body: str = "chassis", *, attempt: int | None = None,
               passed: bool | None = None, label: str = "") -> Path | None:
    import mujoco
    from PIL import Image, ImageDraw

    if not len(frames_qpos):
        return None
    if fps <= 0 or width <= 0 or height <= 0:
        raise ValueError("fps and dimensions must be positive")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    renderer, _ = _try_renderer(model, width, height)
    data = mujoco.MjData(model)
    cam = mujoco.MjvCamera()
    body_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, track_body)
    cam.type = mujoco.mjtCamera.mjCAMERA_TRACKING if body_id >= 0 else mujoco.mjtCamera.mjCAMERA_FREE
    cam.trackbodyid = max(0, body_id)
    cam.distance, cam.elevation, cam.azimuth = 1.3, -20, 150
    font = _font(max(16, round(width / 24)))
    small_font = _font(max(12, round(width / 34)))
    images = []
    # Template sky/floor are light; the GL-free trajectory view uses the same palette.
    fallback_points = []
    if renderer is None:
        for q in frames_qpos:
            data.qpos[:] = q
            mujoco.mj_forward(model, data)
            fallback_points.append(data.xpos[body_id, :2].copy() if body_id >= 0 else np.asarray(q[:2]))
        points = np.asarray(fallback_points)
        low, high = points.min(axis=0), points.max(axis=0)
        span = max(float(np.max(high - low)), 0.5)
        centre = (low + high) / 2
        fallback_points = [((p[0] - centre[0]) / span * width * 0.7 + width / 2,
                            height / 2 - (p[1] - centre[1]) / span * height * 0.6) for p in points]
    try:
        for i, q in enumerate(frames_qpos):
            if renderer is None:
                image = Image.new("RGB", (width, height), "#edf2f7")
                draw = ImageDraw.Draw(image)
                for x in range(0, width, 30):
                    draw.line((x, 0, x, height), fill="#dce3ec")
                for y in range(0, height, 30):
                    draw.line((0, y, width, y), fill="#dce3ec")
                if i:
                    draw.line(fallback_points[:i + 1], fill="#93b8ed", width=3)
                x, y = fallback_points[i]
                draw.rounded_rectangle((x - 10, y - 8, x + 10, y + 8), radius=4, fill="#3b82f6")
                draw.text((12, 54), "Trajectory view · GL unavailable", font=small_font, fill="#475569")
            else:
                data.qpos[:] = q
                mujoco.mj_forward(model, data)
                renderer.update_scene(data, camera=cam)
                image = Image.fromarray(renderer.render().copy()).convert("RGB")
            draw = ImageDraw.Draw(image)
            if attempt is not None:
                title = f"Attempt {attempt}"
                box = draw.textbbox((0, 0), title, font=font)
                draw.rounded_rectangle((10, 10, box[2] + 30, 46), radius=8, fill="#0f172a")
                draw.text((20, 15), title, font=font, fill="white")
            if i >= max(0, len(frames_qpos) - math.ceil(1.5 * fps)) and (passed is not None or label):
                title = "PASSED" if passed is True else (label or "FAILED").replace("_", " ").upper()
                while draw.textlength(title, font=font) > width - 44 and len(title) > 1:
                    title = title[:-2].rstrip("…") + "…"
                top = height - 66
                draw.rounded_rectangle((10, top, width - 10, height - 14), radius=10,
                                       fill="#15803d" if passed is True else "#b91c1c")
                draw.text((22, top + 13), title, font=font, fill="white")
            images.append(image)
    finally:
        if renderer is not None:
            renderer.close()
    _save_gif(images, out, fps)
    return out
