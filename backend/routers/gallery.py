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
    # robots only on the landing page; scene props (couch, bins) are fetched on demand by the sim instead
    ("Standard Bots Thor robot arm", "Standard Bots Thor", "Robot arms", "Standard Bots"),
    ("Franka robot arm", "Franka research arm", "Robot arms", "Franka Robotics"),
    ("Fanuc industrial robot arm", "Fanuc industrial arm", "Robot arms", "Fanuc"),
    ("Comau robot arm", "Comau arm", "Robot arms", "Comau"),
    ("universal robots UR5 arm", "UR cobot arm", "Robot arms", "Teradyne Robotics"),
    ("Robotiq 2F-140 gripper", "Robotiq 2F-140 gripper", "Grippers", "Robotiq"),
    ("Robotiq 2F-85 gripper", "Robotiq 2F-85 gripper", "Grippers", "Robotiq"),
    ("OnRobot gripper", "OnRobot gripper", "Grippers", "OnRobot"),
    ("Robotiq hand-e gripper", "Robotiq Hand-E", "Grippers", "Robotiq"),
    ("AgiBot humanoid robot", "AgiBot humanoid", "Humanoids", "AgiBot"),
    ("humanoid robot", "Humanoid robot", "Humanoids", "SimReady partners"),
    ("quadruped robot dog", "Quadruped robot", "Mobile robots", "SimReady partners"),
    ("autonomous mobile robot AMR", "Autonomous mobile robot", "Mobile robots", "NVIDIA"),
    ("warehouse robot", "Warehouse robot", "Mobile robots", "NVIDIA"),
    ("surgical robot", "Surgical robot", "Medical robots", "NVIDIA"),
    ("robot vacuum cleaner", "Robot vacuum", "Mobile robots", "NVIDIA"),
    ("delivery robot", "Delivery robot", "Mobile robots", "NVIDIA"),
    ("robot end effector suction gripper", "Suction gripper", "Grippers", "SimReady partners"),
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
        a = await fetch_prop(query, timeout_s=90)  # big robot arms need more than the in-run 20 s cap
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
    assets, seen = [], set()
    for q, *_ in CURATED:  # two queries can resolve to the same Hugging Face asset; show it once
        a = _assets.get(q)
        if a and a["source_url"] not in seen:
            seen.add(a["source_url"]); assets.append(a)
    cats: dict[str, int] = {}
    for it in robots + assets:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    return {"robots": robots, "assets": assets, "categories": cats,
            "counts": {"robots": len(robots), "assets": len(assets), "makers": len({a["maker"] for a in assets} | {"RoboForge"})},
            "warming": _warming}
