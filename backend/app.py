"""FastAPI: POST /runs, GET /runs/{id}, POST /webhooks/photon, static /artifacts."""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
from adapters.photon_adapter import PhotonAdapter, get_messaging, parse_photon_webhook
from models import RunCreate, RunState
from orchestrator import RUNS, classify_inbound, load_run, recent_runs, restore_runs, start_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
app = FastAPI(title="RoboForge", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/artifacts", StaticFiles(directory=str(config.STORAGE_DIR)), name="artifacts")
app.include_router(__import__("routers.assets", fromlist=["router"]).router)


@app.on_event("startup")
async def _restore():
    restore_runs()


@app.get("/runs")
async def list_runs(limit: int = 10):
    return {"runs": recent_runs(min(max(limit, 1), 50))}


@app.get("/health")
async def health():
    return {"ok": True, "anthropic": bool(config.ANTHROPIC_API_KEY), "convex": bool(config.CONVEX_URL),
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
