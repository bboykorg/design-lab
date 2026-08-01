"""Design&Lab — FastAPI entry point. Serves the API and the static frontend."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .ai import router as ai_router
from .audit import router as audit_router
from .projects import router as projects_router
from .auth import router as auth_router
from .proxy import router as proxy_router
from .ocr import router as ocr_router

app = FastAPI(title="Design&Lab API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Liveness only — без деталей о ключах и моделях."""
    return {"ok": True}


# API routers first, so they take precedence over the static catch-all mount.
app.include_router(ai_router)
app.include_router(audit_router)
app.include_router(projects_router)
app.include_router(auth_router)
app.include_router(proxy_router)
app.include_router(ocr_router)

# --- Frontend ---------------------------------------------------------------
# index.html is one ~700 KB file, so model/OCR fixes ship as companion scripts.
# The second script also filters menus that are rendered independently from the
# global MODELS map in the original page.
_PATCH_TAGS = (
    '<script src="/models-patch.js"></script>\n'
    '<script src="/hide-google-models.js"></script>'
)
_index_cache = None


def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    missing = []
    if "models-patch.js" not in raw:
        missing.append('<script src="/models-patch.js"></script>')
    if "hide-google-models.js" not in raw:
        missing.append('<script src="/hide-google-models.js"></script>')
    if not missing:
        return raw
    patch = "\n".join(missing)
    i = raw.rfind("</body>")
    if i < 0:
        return raw + patch
    return raw[:i] + patch + "\n" + raw[i:]


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def index():
    global _index_cache
    if _index_cache is None:
        try:
            _index_cache = _build_index()
        except OSError:
            raise HTTPException(status_code=404, detail="frontend/index.html not found")
    return HTMLResponse(_index_cache)


# Static frontend at "/" (assets; index.html is handled by the route above).
if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
