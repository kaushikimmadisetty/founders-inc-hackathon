"""FastAPI: POST /runs, GET /runs/{id}, POST /webhooks/photon, static /artifacts."""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
from adapters.photon_adapter import parse_photon_webhook
from models import RunCreate, RunState
from orchestrator import RUNS, start_run

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
app = FastAPI(title="RoboForge", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/artifacts", StaticFiles(directory=str(config.STORAGE_DIR)), name="artifacts")


@app.get("/health")
async def health():
    return {"ok": True, "anthropic": bool(config.ANTHROPIC_API_KEY), "convex": bool(config.CONVEX_URL),
            "firecrawl": bool(config.FIRECRAWL_API_KEY), "photon": bool(config.PHOTON_API_KEY)}


@app.post("/runs", response_model=RunState)
async def create_run(body: RunCreate):
    if not body.prompt.strip():
        raise HTTPException(400, "empty prompt")
    return start_run(body.prompt.strip(), body.source, body.phone)


@app.get("/runs/{run_id}", response_model=RunState)
async def get_run(run_id: str):
    if run_id not in RUNS:
        raise HTTPException(404, "unknown run")
    return RUNS[run_id]


@app.post("/webhooks/photon")
async def photon_webhook(req: Request):
    payload = await req.json()
    parsed = parse_photon_webhook(payload)
    if not parsed:
        raise HTTPException(400, "could not parse inbound message")
    frm, text = parsed
    state = start_run(text, "imessage", frm)
    return {"ok": True, "run_id": state.run_id}
