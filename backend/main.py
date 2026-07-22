"""Design&Lab — FastAPI entry point. Serves the API and the static frontend."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# Static frontend at "/" (index.html served automatically).
if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
