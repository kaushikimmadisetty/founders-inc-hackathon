"""FastAPI: POST /runs, GET /runs/{id}, POST /webhooks/photon, static /artifacts."""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
from adapters.photon_adapter import PhotonAdapter, get_messaging, parse_photon_webhook
from models import RunCreate, RunState
from orchestrator import RUNS, classify_inbound, load_run, recent_runs, restore_runs, start_run, start_tweak
from pydantic import BaseModel as _BM


class TweakBody(_BM):
    text: str

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
app = FastAPI(title="RoboForge", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/artifacts", StaticFiles(directory=str(config.STORAGE_DIR)), name="artifacts")
app.include_router(__import__("routers.assets", fromlist=["router"]).router)
app.include_router(__import__("routers.gallery", fromlist=["router"]).router)


SEED_PROMPTS = [
    "a robot that fetches my keys from under the couch",
    "a little rover that patrols my apartment at night",
    "a warehouse bot for tight aisles",
]


@app.on_event("startup")
async def _restore():
    restore_runs()
    from routers.gallery import start_warming
    start_warming()
    # Fresh deploy (ephemeral disk): seed the explore gallery with real example runs, staggered.
    if config.DEMO_SEED_RUNS and not RUNS:
        import asyncio

        async def seed():
            for i, prompt in enumerate(SEED_PROMPTS):
                await asyncio.sleep(2 + i * 20)
                start_run(prompt, "web")
        asyncio.get_event_loop().create_task(seed())


@app.get("/runs")
async def list_runs(limit: int = 10):
    return {"runs": recent_runs(min(max(limit, 1), 50))}


@app.get("/health")
async def health():
    return {"ok": True, "llm": config.LLM_PROVIDER or None, "agent_model": config.AGENT_MODEL or None, "planner_model": config.PLANNER_MODEL or None,
            "anthropic": bool(config.ANTHROPIC_API_KEY), "openai": bool(config.OPENAI_API_KEY), "convex": bool(config.CONVEX_URL),
            "firecrawl": bool(config.FIRECRAWL_API_KEY), "photon": bool(config.PHOTON_API_KEY)}


@app.post("/runs", response_model=RunState)
async def create_run(body: RunCreate):
    if not body.prompt.strip():
        raise HTTPException(400, "empty prompt")
    if body.parent_run_id and load_run(body.parent_run_id) is None:
        raise HTTPException(404, "unknown parent run")
    return start_run(body.prompt.strip(), body.source, body.phone, body.parent_run_id)


@app.get("/runs/{run_id}", response_model=RunState)
async def get_run(run_id: str):
    st = load_run(run_id)
    if st is None:
        raise HTTPException(404, "unknown run")
    return st


_seen_messages: set[str] = set()


@app.post("/runs/{run_id}/tweak", response_model=RunState)
async def tweak_run(run_id: str, body: TweakBody):
    """Etch-style in-place change: same run, new iteration, parts/body/sim refreshed. Poll GET /runs/{id}; `busy` flips false when done and `tweaks[-1]` has the step timings."""
    if not body.text.strip():
        raise HTTPException(400, "empty change")
    st = start_tweak(run_id, body.text.strip())
    if st is None:
        raise HTTPException(409, "run unknown, still building, or already applying a change")
    return st


@app.post("/webhooks/photon")
async def photon_webhook(req: Request):
    # Non-message events get 200 too, otherwise Photon retries them.
    msg = parse_photon_webhook(await req.json())
    if not msg:
        return {"ok": True, "ignored": True}
    if msg.message_id in _seen_messages:
        return {"ok": True, "duplicate": True}
    _seen_messages.add(msg.message_id)
    messaging = get_messaging()
    if isinstance(messaging, PhotonAdapter):
        messaging.remember(msg)
    parent = classify_inbound(msg.handle, msg.text)
    state = start_run(msg.text, "imessage", msg.handle, parent)
    return {"ok": True, "run_id": state.run_id, "revises": parent}
