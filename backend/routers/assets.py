"""Optional scene props; a null result tells clients to retain primitive boxes."""
from dataclasses import asdict

from fastapi import APIRouter, Query
from sim.assets import fetch_prop

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("/prop")
async def prop(query: str = Query(min_length=1, max_length=300)):
    asset = await fetch_prop(query)
    return asdict(asset) if asset else None
