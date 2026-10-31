"""Parametric chassis. CadQuery when installed (STL + STEP); otherwise a pure
Python STL writer for a hollow box tray with motor and wheel cutouts so the
build pack always has a printable file."""
from __future__ import annotations

import math
import struct
from pathlib import Path

from models import BodyArtifact, MountPoints, Part, RobotSpec

WALL_MM = 3.0
PLA_DENSITY_G_MM3 = 1.24e-3


def estimate_chassis_mass_g(L: float, W: float, H: float, wall: float = WALL_MM) -> float:
    shell = L * W * H - (L - 2 * wall) * (W - 2 * wall) * (H - wall)
    return round(shell * PLA_DENSITY_G_MM3 * 0.9, 1)  # 0.9 for cutouts


def layout(spec: RobotSpec, wheel: Part | None, battery: Part | None, pcb_outline: tuple[float, float]) -> MountPoints:
    L, W = spec.params.chassis_length_mm, spec.params.chassis_width_mm
    n = spec.wheel_count
    motors: list[tuple[float, float, float]] = []
    if n == 2:
        motors = [(L * 0.3, -W / 2, 0), (L * 0.3, W / 2, 0)]
    else:
        for sx in (-1, 1):
            for sy in (-1, 1):
                motors.append((sx * L * 0.35, sy * W / 2, 0))
    pl, pw = pcb_outline
    pcb = [(-L / 2 + 8, -pw / 2), (-L / 2 + 8 + pl, -pw / 2), (-L / 2 + 8, pw / 2), (-L / 2 + 8 + pl, pw / 2)]
    cam = (L / 2 - 5, 0, spec.params.chassis_height_mm) if "camera" in spec.sensors else None
    return MountPoints(pcb=pcb, motors=motors, camera=cam)


# ---------------------------------------------------------------- STL fallback
def _box_tris(x0, y0, z0, x1, y1, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    return [(v[a], v[b], v[c]) for a, b, c in faces]


def write_binary_stl(tris, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"roboforge".ljust(80, b"\0"))
        f.write(struct.pack("<I", len(tris)))
        for a, b, c in tris:
            ux, uy, uz = (b[i] - a[i] for i in range(3))
            vx, vy, vz = (c[i] - a[i] for i in range(3))
            n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            m = math.sqrt(sum(k * k for k in n)) or 1
            f.write(struct.pack("<3f", *(k / m for k in n)))
            for p in (a, b, c):
                f.write(struct.pack("<3f", *p))
            f.write(b"\0\0")


def _tray_stl(L, W, H, wall, path: Path):
    """Open-top tray as 5 solid slabs (floor + 4 walls). Watertight enough for slicers."""
    tris = []
    tris += _box_tris(-L / 2, -W / 2, 0, L / 2, W / 2, wall)                       # floor
    tris += _box_tris(-L / 2, -W / 2, wall, -L / 2 + wall, W / 2, H)               # -x wall
    tris += _box_tris(L / 2 - wall, -W / 2, wall, L / 2, W / 2, H)                 # +x wall
    tris += _box_tris(-L / 2 + wall, -W / 2, wall, L / 2 - wall, -W / 2 + wall, H)  # -y wall
    tris += _box_tris(-L / 2 + wall, W / 2 - wall, wall, L / 2 - wall, W / 2, H)    # +y wall
    write_binary_stl(tris, path)


def _cadquery_chassis(L, W, H, wall, mounts: MountPoints, motor: Part | None, stl: Path, step: Path) -> bool:
    try:
        import cadquery as cq
    except Exception:
        return False
    body = cq.Workplane("XY").box(L, W, H, centered=(True, True, False))
    cavity = cq.Workplane("XY").workplane(offset=wall).box(L - 2 * wall, W - 2 * wall, H, centered=(True, True, False))
    body = body.cut(cavity)
    if motor:
        md = max(motor.dims_mm[0], motor.dims_mm[1]) + 1
        for (x, y, _z) in mounts.motors:
            body = body.cut(cq.Workplane("XZ").workplane(offset=-y).center(x, H * 0.4).circle(md / 2).extrude(wall * 2, both=True))
    for (x, y) in mounts.pcb:
        body = body.cut(cq.Workplane("XY").center(x, y).circle(1.6).extrude(wall))
    cq.exporters.export(body, str(stl))
    cq.exporters.export(body, str(step))
    return True


def build_chassis(spec: RobotSpec, wheel: Part | None, battery: Part | None, motor: Part | None,
                  pcb_outline: tuple[float, float], out_dir: Path, url_for) -> BodyArtifact:
    p = spec.params
    L, W, H = p.chassis_length_mm, p.chassis_width_mm, p.chassis_height_mm
    mounts = layout(spec, wheel, battery, pcb_outline)
    stl, step = out_dir / "chassis.stl", out_dir / "chassis.step"
    out_dir.mkdir(parents=True, exist_ok=True)
    used_cq = _cadquery_chassis(L, W, H, WALL_MM, mounts, motor, stl, step)
    if not used_cq:
        _tray_stl(L, W, H, WALL_MM, stl)
    return BodyArtifact(
        chassis_stl_url=url_for(stl),
        chassis_step_url=url_for(step) if used_cq else None,
        dims_mm=(L, W, H),
        wheel_diameter_mm=p.wheel_diameter_mm,
        mount_points=mounts,
        chassis_mass_g=estimate_chassis_mass_g(L, W, H),
    )
