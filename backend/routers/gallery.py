"""Explore feed for the landing page: recent robots built here plus a curated
set of Hugging Face SimReady assets (NVIDIA + partners, CC-BY-4.0) converted to
GLB by sim.assets. Assets are warmed in the background at startup so the first
page load is instant; anything not yet converted is simply omitted."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict

from fastapi import APIRouter

from sim.assets import fetch_prop

log = logging.getLogger("gallery")
router = APIRouter(prefix="/gallery", tags=["gallery"])

# (query, title, category, maker)
CURATED: list[tuple[str, str, str, str]] = [
    ("couch sofa", "Soft sofa", "Furniture", "NVIDIA"),
    ("waste bin", "Waste bin", "Props", "NVIDIA"),
    ("wooden pallet", "Block pallet", "Warehouse", "NVIDIA"),
    ("cardboard box", "Cardboard box", "Warehouse", "PalatialSim"),
    ("robot arm", "Industrial robot arm", "Robots", "SimReady partners"),
    ("robotic gripper", "Robotiq gripper", "Robots", "Robotiq"),
    ("forklift", "Forklift", "Warehouse", "NVIDIA"),
    ("warehouse shelf rack", "Shelf rack", "Warehouse", "NVIDIA"),
    ("office chair", "Office chair", "Furniture", "NVIDIA"),
    ("hospital bed", "Hospital bed", "Medical", "NVIDIA"),
    ("traffic cone", "Traffic cone", "Props", "NVIDIA"),
    ("fire extinguisher", "Fire extinguisher", "Props", "NVIDIA"),
]

_assets: dict[str, dict] = {}
_warming = False


async def warm_assets() -> None:
    """Convert the curated list sequentially (each bounded to 20 s by fetch_prop)."""
    global _warming
    if _warming:
        return
    _warming = True
    for query, title, category, maker in CURATED:
        if query in _assets:
            continue
        a = await fetch_prop(query)
        if a:
            _assets[query] = {"type": "asset", "id": query.replace(" ", "-"), "title": title, "category": category, "maker": maker,
                              "license": a.license, "thumbnail_url": a.thumbnail_url, "glb_url": a.glb_url, "obj_url": a.obj_url,
                              "dims_m": a.dims_m, "source_url": a.source_url, "query": query}
            log.info("gallery asset ready: %s", title)
    _warming = False


def start_warming() -> None:
    asyncio.get_event_loop().create_task(warm_assets())


@router.get("")
async def gallery(limit: int = 24):
    from orchestrator import RUNS, recent_runs
    robots = []
    for r in recent_runs(limit):
        st = RUNS.get(r["run_id"])
        if not st or not st.spec:
            continue
        last = st.reports[-1] if st.reports else None
        robots.append({
            "type": "robot", "id": st.run_id, "title": st.prompt, "category": st.spec.template.replace("_", " "),
            "maker": "texted in" if st.source == "imessage" else "web", "status": st.status, "iteration": st.iteration,
            "thumbnail_url": last.gif_url if last else None, "bom_usd": st.parts.total_usd if st.parts else None,
            "passed": st.status == "passed", "link": f"/run/{st.run_id}", "created_ms": r["created_ms"],
            "task": st.spec.task.description,
        })
    assets = [_assets[q] for q, *_ in CURATED if q in _assets]
    cats: dict[str, int] = {}
    for it in robots + assets:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    return {"robots": robots, "assets": assets, "categories": cats,
            "counts": {"robots": len(robots), "assets": len(assets), "makers": len({a["maker"] for a in assets} | {"RoboForge"})},
            "warming": _warming}
