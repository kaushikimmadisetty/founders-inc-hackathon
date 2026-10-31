"""Firecrawl: real, buyable parts. Two uses:
  - scrape_product(url): live price / stock / title from the part's actual store page
  - search_parts(query): candidate product pages for the LLM parts agent
Every call is bounded (FIRECRAWL_TIMEOUT_S) and returns None/[] on failure so the
catalog remains the fallback. Never block the run on Firecrawl."""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import httpx

import config

log = logging.getLogger("firecrawl")
BASE = "https://api.firecrawl.dev/v1"

PRODUCT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "price_usd": {"type": "number", "description": "current unit price in USD, numeric only"},
        "in_stock": {"type": "boolean", "description": "true if the item can be added to cart / is in stock"},
        "vendor": {"type": "string"},
    },
    "required": ["price_usd"],
}


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {config.FIRECRAWL_API_KEY}", "Content-Type": "application/json"}


def enabled() -> bool:
    return bool(config.FIRECRAWL_API_KEY)


async def scrape_product(url: str, timeout_s: float | None = None) -> dict[str, Any] | None:
    """Live price/stock for one store page via Firecrawl JSON extraction."""
    if not enabled() or not url.startswith("http"):
        return None
    timeout_s = timeout_s or config.FIRECRAWL_TIMEOUT_S
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as http:
            r = await asyncio.wait_for(http.post(f"{BASE}/scrape", headers=_headers(), json={
                "url": url,
                "formats": ["json"],
                "onlyMainContent": True,
                "jsonOptions": {
                    "schema": PRODUCT_SCHEMA,
                    "prompt": "Extract the product title, its current unit price in USD, whether it is in stock, and the vendor name.",
                },
            }), timeout=timeout_s)
            r.raise_for_status()
            data = (r.json().get("data") or {})
            j = data.get("json") or {}
            if not isinstance(j, dict) or j.get("price_usd") in (None, 0):
                return None
            return {
                "title": j.get("title") or (data.get("metadata") or {}).get("title"),
                "price_usd": float(j["price_usd"]),
                "in_stock": j.get("in_stock"),
                "vendor": j.get("vendor") or urlparse(url).netloc.replace("www.", ""),
                "url": (data.get("metadata") or {}).get("sourceURL") or url,
            }
    except Exception as e:
        log.warning("firecrawl scrape failed for %s: %s", url, e)
        return None


async def search_parts(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Product-page candidates (title, url, snippet) for the LLM parts agent."""
    if not enabled():
        return []
    try:
        async with httpx.AsyncClient(timeout=config.FIRECRAWL_TIMEOUT_S) as http:
            r = await asyncio.wait_for(http.post(f"{BASE}/search", headers=_headers(), json={
                "query": query, "limit": limit, "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True},
            }), timeout=config.FIRECRAWL_TIMEOUT_S)
            r.raise_for_status()
            return r.json().get("data", []) or []
    except Exception as e:
        log.warning("firecrawl search failed for %r: %s", query, e)
        return []
