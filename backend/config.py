import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")
CONVEX_URL = os.getenv("CONVEX_URL", "")
CONVEX_DEPLOY_KEY = os.getenv("CONVEX_DEPLOY_KEY", "")
PHOTON_API_KEY = os.getenv("PHOTON_API_KEY", "")
PHOTON_NUMBER = os.getenv("PHOTON_NUMBER", "")
HEYPCB_API_KEY = os.getenv("HEYPCB_API_KEY", "")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000").rstrip("/")

import platform as _platform
_gl_default = {"Linux": "egl", "Darwin": "cgl"}.get(_platform.system(), "glfw")
_gl = os.getenv("MUJOCO_GL", "").lower()
if not _gl or (_platform.system() == "Darwin" and _gl in ("egl", "osmesa")) or (_platform.system() == "Linux" and _gl == "cgl"):
    os.environ["MUJOCO_GL"] = _gl_default

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", ROOT / "storage"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

AGENT_MODEL = os.getenv("AGENT_MODEL", "claude-sonnet-5-5")
PLANNER_MODEL = os.getenv("PLANNER_MODEL", "claude-opus-5-5")
MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "3"))
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "40"))
FIRECRAWL_TIMEOUT_S = float(os.getenv("FIRECRAWL_TIMEOUT_S", "20"))
SIM_SEED = int(os.getenv("SIM_SEED", "7"))

# Demo mode: force attempt 1 of fetch_under_obstacle to be too tall so the
# fail -> fix -> pass loop is visible. Disable with DEMO_SCRIPTED_FAIL=0.
DEMO_SCRIPTED_FAIL = os.getenv("DEMO_SCRIPTED_FAIL", "1") == "1"


def artifact_url(rel: str) -> str:
    return f"{BACKEND_BASE_URL}/artifacts/{rel}"
