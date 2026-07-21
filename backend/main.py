"""Design&Lab — FastAPI entry point. Serves the API and the static frontend."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .ai import router as ai_router
from .audit import router as audit_router
from .projects import router as projects_router
from .auth import router as auth_router
from .ocr import router as ocr_router

app = FastAPI(title="Design&Lab API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cross_origin_isolation(request, call_next):
    """WebContainers (in-browser Node) require the document to be cross-origin
    isolated. COEP=credentialless keeps no-cors resources (thumbnails, fonts,
    template iframes) loading in Chromium while enabling isolation."""
    resp = await call_next(request)
    if config.CROSS_ORIGIN_ISOLATION:
        resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        resp.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    return resp


@app.get("/api/health")
def health():
    return {"ok": True, "ai_ready": config.has_ai_key(), "model": config.AI_MODEL,
            "auth": config.AUTH_ENABLED, "auth_store": config.AUTH_STORE,
            "ocr_ready": config.OCR_ENABLED and config.has_ocr_key(),
            "coi": config.CROSS_ORIGIN_ISOLATION}


# API routers first, so they take precedence over the static catch-all mount.
app.include_router(ai_router)
app.include_router(audit_router)
app.include_router(projects_router)
app.include_router(auth_router)
app.include_router(ocr_router)

# Static frontend at "/" (index.html served automatically).
if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
