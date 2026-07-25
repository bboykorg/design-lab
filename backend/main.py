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
    return {"ok": True, "ai_ready": config.has_ai_key(), "model": config.AI_MODEL,
            "auth": config.AUTH_ENABLED}


# API routers first, so they take precedence over the static catch-all mount.
app.include_router(ai_router)
app.include_router(audit_router)
app.include_router(projects_router)
app.include_router(auth_router)
app.include_router(proxy_router)

# --- Frontend ---------------------------------------------------------------
# index.html is one ~700 KB file, so small model-list fixes ship as a companion
# script: frontend/models-cerebras.js puts the Cerebras models back into the
# model lists. It is injected right before the closing </body> when the page is
# served, so the static file itself stays untouched.
_PATCH_TAG = '<script src="/models-cerebras.js"></script>'
_index_cache = None


def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    if "models-cerebras.js" in raw:
        return raw
    i = raw.rfind("</body>")  # last one = the document's real closing tag
    if i < 0:
        return raw + _PATCH_TAG
    return raw[:i] + _PATCH_TAG + "\n" + raw[i:]


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
