"""Texture-free SimReady props. OBJ is Z-up; GLB is Y-up, both metres.

Conversion runs in a disposable process so the 20 second deadline also bounds
native USD/trimesh work. A failed prop always returns None for primitive fallback.
"""
from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
import hashlib
import io
import json
import logging
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urljoin, urlparse

import config

log = logging.getLogger(__name__)
API = "https://nvidia-simready-central.hf.space"
ASSETS = config.STORAGE_DIR / "assets"


@dataclass
class PropAsset:
    glb_url: str
    obj_url: str
    thumbnail_url: str
    dims_m: list[float]
    source_url: str
    license: str = "CC-BY-4.0"


def _asset(folder: Path) -> PropAsset:
    meta = json.loads((folder / "meta.json").read_text())
    if not all((folder / name).is_file() for name in ("prop.glb", "prop.obj", "thumbnail.png")):
        raise ValueError("Incomplete prop cache")
    return PropAsset(**{f"{kind}_url": config.artifact_url(f"assets/{folder.name}/{name}")
                        for kind, name in (("glb", "prop.glb"), ("obj", "prop.obj"), ("thumbnail", "thumbnail.png"))},
                     dims_m=meta["dims_m"], source_url=meta["source_url"], license=meta["license"])


async def fetch_prop(query: str, timeout_s: float = 20) -> PropAsset | None:
    """timeout_s: 20 s during a run (never stall the sim); the gallery warm-up passes more."""
    if not query.strip():
        return None
    process = None
    try:
        async with asyncio.timeout(timeout_s):
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "sim.assets", query[:300], cwd=str(config.ROOT),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            stdout, stderr = await process.communicate()
            if process.returncode:
                log.warning("Prop unavailable for %r: %s", query, stderr.decode(errors="replace")[-1200:])
                return None
            return PropAsset(**json.loads(stdout))
    except Exception as exc:
        log.warning("Prop fallback for %r: %s", query, exc)
        return None
    finally:
        if process is not None and process.returncode is None:
            process.kill()
            await process.communicate()


BLUEPRINT_BG = (238, 244, 251)


def _lighten_background(img):
    """NVIDIA's thumbnails often sit on a black studio backdrop. Flood-fill the backdrop
    from the four corners to our blueprint tint, so dark robot parts stay dark."""
    from PIL import ImageDraw
    w, h = img.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    dark = sum(1 for c in corners if sum(img.getpixel(c)) < 150)
    if dark < 3:
        return img
    out = img.copy()
    for c in corners:
        if sum(out.getpixel(c)) < 150:
            ImageDraw.floodfill(out, c, BLUEPRINT_BG, thresh=60)
    return out


def _build(query: str) -> PropAsset:
    import httpx
    import numpy as np
    import trimesh
    from PIL import Image
    from pxr import Sdf, Usd, UsdGeom

    ASSETS.mkdir(parents=True, exist_ok=True)
    query_key = hashlib.sha256(query.strip().lower().encode()).hexdigest()
    query_file = ASSETS / f"query-{query_key}.json"
    if query_file.exists():
        try:
            return _asset(ASSETS / json.loads(query_file.read_text())["slug"])
        except (ValueError, OSError, KeyError):
            pass
    with httpx.Client(timeout=12, follow_redirects=True) as client:
        response = client.get(f"{API}/search", params={"description": query, "limit": 5, "file_extension_include": "usd,usda,usdc"})
        response.raise_for_status()
        hits = response.json()
        if not hits:
            raise ValueError("No SimReady results")
        source = max(hits, key=lambda h: h.get("score", 0))["url"]
        if not source.startswith("https://huggingface.co/datasets/") or "/blob/" not in source:
            raise ValueError("Unexpected asset source")
        slug = re.sub(r"[^a-z0-9-]+", "-", Path(urlparse(source).path).stem.lower()).strip("-")[:60]
        slug += "-" + hashlib.sha256(source.encode()).hexdigest()[:12]
        folder = ASSETS / slug
        if (folder / "meta.json").exists():
            result = _asset(folder)
        else:
            with tempfile.TemporaryDirectory(prefix="simready-", dir=ASSETS) as temp:
                work = Path(temp)
                downloaded: dict[str, Path] = {}

                def download(url: str) -> Path:
                    url = url.replace("/blob/", "/resolve/")
                    if url in downloaded:
                        return downloaded[url]
                    if len(downloaded) >= 80 or not url.startswith("https://huggingface.co/datasets/"):
                        raise ValueError("Invalid or excessive USD dependencies")
                    suffix = Path(urlparse(url).path).suffix.lower()
                    path = work / (hashlib.sha256(url.encode()).hexdigest() + suffix)
                    downloaded[url] = path
                    r = client.get(url)
                    r.raise_for_status()
                    if len(r.content) > 80_000_000:
                        raise ValueError("USD asset too large")
                    path.write_bytes(r.content)
                    layer = Sdf.Layer.FindOrOpen(str(path))
                    if layer is None:
                        raise ValueError("Cannot open USD layer")
                    # This includes sublayers, references and payloads, without
                    # fetching shader assets, textures or MDL dependencies.
                    for ref in layer.GetExternalReferences():
                        if Path(urlparse(ref).path).suffix.lower() in (".usd", ".usda", ".usdc"):
                            dependency = download(urljoin(url, ref))
                            layer.UpdateExternalReference(ref, str(dependency))
                    layer.Save()
                    return path

                root = download(source)
                stage = Usd.Stage.Open(str(root), load=Usd.Stage.LoadAll)
                if stage is None:
                    raise ValueError("Cannot compose USD")
                xforms = UsdGeom.XformCache(Usd.TimeCode.Default())
                metres = UsdGeom.GetStageMetersPerUnit(stage)
                meshes = []
                for prim in Usd.PrimRange.Stage(stage, Usd.TraverseInstanceProxies()):
                    if not prim.IsA(UsdGeom.Mesh):
                        continue
                    geom = UsdGeom.Mesh(prim)
                    if geom.ComputeVisibility() == UsdGeom.Tokens.invisible:
                        continue
                    points = np.asarray(geom.GetPointsAttr().Get(), dtype=float)
                    if points.size == 0:
                        continue
                    matrix = np.asarray(xforms.GetLocalToWorldTransform(prim))
                    vertices = (np.c_[points, np.ones(len(points))] @ matrix)[:, :3] * metres
                    counts = geom.GetFaceVertexCountsAttr().Get()
                    indices = geom.GetFaceVertexIndicesAttr().Get()
                    holes = set(geom.GetHoleIndicesAttr().Get() or [])
                    faces, offset = [], 0
                    for face_id, count in enumerate(counts):
                        polygon = indices[offset:offset + count]
                        if face_id not in holes:
                            faces.extend((polygon[0], polygon[i], polygon[i + 1]) for i in range(1, count - 1))
                        offset += count
                    if not faces:
                        continue
                    faces = np.asarray(faces)
                    if (geom.GetOrientationAttr().Get() == "leftHanded") != (np.linalg.det(matrix[:3, :3]) < 0):
                        faces = faces[:, ::-1]
                    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
                    colors = geom.GetDisplayColorAttr().Get()
                    color = np.asarray(colors[0]) if colors else np.array([0.55, 0.60, 0.66])
                    mesh.visual.face_colors = np.r_[np.clip(color * 255, 0, 255), 255].astype(np.uint8)
                    meshes.append(mesh)
                if not meshes:
                    raise ValueError("USD has no meshes")
                mesh = trimesh.util.concatenate(meshes)
                if UsdGeom.GetStageUpAxis(stage) == "Y":
                    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
                # Ground and centre the prop, so consumers can place it directly.
                mesh.apply_translation([-mesh.centroid[0], -mesh.centroid[1], -mesh.bounds[0, 2]])
                dims = mesh.extents.tolist()
                if not np.isfinite(dims).all() or min(dims) <= 0:
                    raise ValueError("Invalid prop bounds")
                # Showpiece robots need detail; 200k faces keeps arms/grippers recognisable (was 45k, which turned them into blobs).
                if len(mesh.faces) > 200_000:
                    mesh = mesh.simplify_quadric_decimation(face_count=200_000)
                mesh.export(work / "prop.obj")
                mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
                mesh.export(work / "prop.glb")
                if (work / "prop.glb").stat().st_size > 14_000_000:
                    raise ValueError("Prop exceeds mesh budget")
                # Re-open the exported artifact before publishing the cache.
                check = trimesh.load(work / "prop.glb", force="mesh")
                if not len(check.faces):
                    raise ValueError("Empty GLB export")
                thumbnail = client.get(f"{API}/images", params={"asset_url": source})
                thumbnail.raise_for_status()
                with Image.open(io.BytesIO(thumbnail.content)) as image:
                    image.thumbnail((512, 512))
                    _lighten_background(image.convert("RGB")).save(work / "thumbnail.png")
                meta = {"dims_m": dims, "source_url": source, "license": "CC-BY-4.0", "obj_up_axis": "Z", "glb_up_axis": "Y"}
                folder.mkdir(exist_ok=True)
                for name in ("prop.obj", "prop.glb", "thumbnail.png"):
                    (work / name).replace(folder / name)
                # Metadata is the completion marker, written last and atomically.
                (work / "meta.json").write_text(json.dumps(meta, indent=2))
                (work / "meta.json").replace(folder / "meta.json")
                result = _asset(folder)
        query_file.write_text(json.dumps({"slug": slug}))
        return result


if __name__ == "__main__":
    try:
        print(json.dumps(asdict(_build(sys.argv[1]))))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
