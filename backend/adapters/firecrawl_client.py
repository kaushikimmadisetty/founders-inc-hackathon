"""Firecrawl search + extract for real part candidates. Hard 20s budget, returns [] on any failure."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

import config

log = logging.getLogger("firecrawl")
BASE = "https://api.firecrawl.dev/v1"


async def search_parts(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Returns raw search hits with markdown content. Empty list if disabled or failing."""
    if not config.FIRECRAWL_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=config.FIRECRAWL_TIMEOUT_S) as http:
            r = await asyncio.wait_for(http.post(
                f"{BASE}/search",
                headers={"Authorization": f"Bearer {config.FIRECRAWL_API_KEY}"},
                json={"query": query, "limit": limit, "scrapeOptions": {"formats": ["markdown"]}},
            ), timeout=config.FIRECRAWL_TIMEOUT_S)
            r.raise_for_status()
            return r.json().get("data", []) or []
    except Exception as e:
        log.warning("firecrawl search failed for %r: %s", query, e)
        return []
