from __future__ import annotations

import logging
from pathlib import Path

from adapters import fallback_board, heypcb_adapter
from models import BoardArtifact, PartsSelection, RobotSpec

log = logging.getLogger("agent.board")


async def design_board(spec: RobotSpec, parts: PartsSelection, out_dir: Path, url_for, revision: str = "") -> BoardArtifact:
    outline = fallback_board.outline_for_chassis(spec.params.chassis_length_mm, spec.params.chassis_width_mm)
    if "smaller" in revision.lower():
        outline = (round(outline[0] * 0.8), round(outline[1] * 0.8))
    holes = fallback_board.mount_holes(outline)
    bom = fallback_board.reference_bom(parts, spec.wheel_count)
    art = await heypcb_adapter.design_board(outline, holes, bom, spec.run_id)
    if art:
        return art
    png = fallback_board.render_png(outline, holes, bom, out_dir / "pcb_render.png")
    return BoardArtifact(provider="fallback", outline_mm=outline, mount_holes_mm=holes, bom_lines=bom, render_png_url=url_for(png))
