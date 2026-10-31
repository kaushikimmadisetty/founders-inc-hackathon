"""Writes run state, agent events, artifacts and sim reports to Convex over HTTP.
Convex functions live in web/convex/*.ts. No-op (log only) when CONVEX_URL unset,
so the backend runs standalone."""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

import config

log = logging.getLogger("convex")


class ConvexClient:
    def __init__(self, url: str = config.CONVEX_URL):
        self.url = url.rstrip("/")
        self._http = httpx.AsyncClient(timeout=10)

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    async def mutation(self, name: str, args: dict[str, Any]) -> Any:
        if not self.enabled:
            log.info("[convex off] %s %s", name, {k: v for k, v in args.items() if k != "payloadJson"})
            return None
        try:
            r = await self._http.post(f"{self.url}/api/mutation", json={"path": name, "args": args, "format": "json"})
            r.raise_for_status()
            return r.json().get("value")
        except Exception as e:  # never let telemetry kill a run
            log.warning("convex mutation %s failed: %s", name, e)
            return None

    # convenience wrappers matching web/convex/*.ts
    async def upsert_run(self, **fields):
        return await self.mutation("runs:upsert", fields)

    async def event(self, run_id: str, agent: str, kind: str, message: str, payload: Any = None, iteration: int = 0):
        import json
        return await self.mutation("agentEvents:add", {
            "runId": run_id, "agent": agent, "kind": kind, "message": message,
            "payloadJson": json.dumps(payload, default=str) if payload is not None else None,
            "iteration": iteration, "ts": int(time.time() * 1000),
        })

    async def artifact(self, run_id: str, kind: str, url: str, iteration: int, label: str = ""):
        return await self.mutation("artifacts:add", {
            "runId": run_id, "kind": kind, "url": url, "iteration": iteration, "label": label,
            "ts": int(time.time() * 1000)})

    async def sim_report(self, run_id: str, report: dict):
        return await self.mutation("simReports:add", {"runId": run_id, **report})


convex = ConvexClient()
