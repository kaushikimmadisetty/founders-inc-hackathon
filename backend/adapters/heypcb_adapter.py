"""HeyPCB carrier board adapter. API availability unconfirmed. Returns None on any
failure so the board agent falls back to `fallback_board`."""
from __future__ import annotations

import logging

import httpx

import config
from models import BoardArtifact, BomLine

log = logging.getLogger("heypcb")
BASE = "https://api.heypcb.com/v1"  # TODO confirm onsite


async def design_board(outline_mm: tuple[float, float], mount_holes: list[tuple[float, float]],
                       bom: list[BomLine], run_id: str) -> BoardArtifact | None:
    if not config.HEYPCB_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=25, headers={"Authorization": f"Bearer {config.HEYPCB_API_KEY}"}) as http:
            r = await http.post(f"{BASE}/boards", json={
                "name": f"roboforge-{run_id[:8]}",
                "outline_mm": list(outline_mm),
                "mount_holes_mm": [list(h) for h in mount_holes],
                "bom": [b.model_dump() for b in bom],
            })
            r.raise_for_status()
            d = r.json()
            return BoardArtifact(
                provider="heypcb", outline_mm=outline_mm, mount_holes_mm=mount_holes, bom_lines=bom,
                render_png_url=d.get("render_url"), gerbers_zip_url=d.get("gerbers_url"),
                enclosure_stl_url=d.get("enclosure_url"),
            )
    except Exception as e:
        log.warning("heypcb failed: %s", e)
        return None
