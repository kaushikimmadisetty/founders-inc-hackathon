"""Reference carrier board: MCU + dual motor driver + regulator + headers, drawn
parametrically with Pillow to fit the chassis. Honest `provider: fallback`."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from models import BoardArtifact, BomLine, PartsSelection


def reference_bom(parts: PartsSelection, wheel_count: int) -> list[BomLine]:
    lines: list[BomLine] = []
    mcu = parts.by_role("mcu")
    drv = parts.by_role("motor_driver")
    reg = parts.by_role("regulator")
    imu = parts.by_role("imu")
    if mcu:
        lines.append(BomLine(ref="U1", part=mcu.name, qty=1, unit_price_usd=mcu.unit_price_usd))
    if drv:
        lines.append(BomLine(ref="U2" + ("-U3" if wheel_count > 2 else ""), part=drv.name,
                             qty=max(1, wheel_count // 2), unit_price_usd=drv.unit_price_usd))
    if reg:
        lines.append(BomLine(ref="U4", part=reg.name, qty=1, unit_price_usd=reg.unit_price_usd))
    if imu:
        lines.append(BomLine(ref="U5", part=imu.name, qty=1, unit_price_usd=imu.unit_price_usd))
    lines += [
        BomLine(ref="J1", part="XT30 battery connector", qty=1, unit_price_usd=0.6),
        BomLine(ref="J2-J%d" % (1 + wheel_count), part="JST-PH 2pin motor header", qty=wheel_count, unit_price_usd=0.15),
        BomLine(ref="J10", part="2x5 2.54mm sensor header", qty=1, unit_price_usd=0.3),
        BomLine(ref="C1-C4", part="100uF 16V electrolytic", qty=4, unit_price_usd=0.1),
        BomLine(ref="SW1", part="SPDT slide power switch", qty=1, unit_price_usd=0.4),
    ]
    return lines


def outline_for_chassis(length_mm: float, width_mm: float) -> tuple[float, float]:
    """Board sized to ~45% of chassis footprint, clamped to sane PCB sizes."""
    L = max(50.0, min(120.0, round(length_mm * 0.45)))
    W = max(40.0, min(90.0, round(width_mm * 0.45)))
    return (L, W)


def mount_holes(outline: tuple[float, float]) -> list[tuple[float, float]]:
    L, W = outline
    return [(3.5, 3.5), (L - 3.5, 3.5), (3.5, W - 3.5), (L - 3.5, W - 3.5)]


def render_png(outline: tuple[float, float], holes: list[tuple[float, float]], bom: list[BomLine], out: Path) -> Path:
    scale = 8
    L, W = outline
    img = Image.new("RGB", (int(L * scale) + 40, int(W * scale) + 40), (18, 18, 22))
    d = ImageDraw.Draw(img)
    ox, oy = 20, 20
    d.rounded_rectangle([ox, oy, ox + L * scale, oy + W * scale], radius=12, fill=(20, 92, 60), outline=(200, 200, 200), width=2)
    for (x, y) in holes:
        d.ellipse([ox + x * scale - 10, oy + y * scale - 10, ox + x * scale + 10, oy + y * scale + 10], fill=(18, 18, 22), outline=(230, 200, 90), width=3)
    # footprints laid out on a grid
    cols = [(0.08, 0.15, 0.42, 0.60), (0.56, 0.15, 0.78, 0.45), (0.56, 0.52, 0.78, 0.82), (0.82, 0.15, 0.94, 0.82), (0.08, 0.70, 0.42, 0.88)]
    for i, line in enumerate(bom[:5]):
        x0, y0, x1, y1 = cols[i]
        d.rectangle([ox + x0 * L * scale, oy + y0 * W * scale, ox + x1 * L * scale, oy + y1 * W * scale], fill=(30, 30, 34), outline=(240, 240, 240), width=2)
        d.text((ox + x0 * L * scale + 6, oy + y0 * W * scale + 6), f"{line.ref}\n{line.part[:22]}", fill=(255, 255, 255))
    d.text((ox + 6, oy + W * scale - 16), f"RoboForge carrier {int(L)}x{int(W)}mm  provider=fallback", fill=(255, 220, 120))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    return out
