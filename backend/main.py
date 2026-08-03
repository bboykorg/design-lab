"""Design&Lab — FastAPI entry point. Serves the API and the static frontend."""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .ai import router as ai_router
from .audit import router as audit_router
from .projects import router as projects_router
from .auth import router as auth_router
from .plans import router as plans_router
from .profile import router as profile_router
from .proxy import router as proxy_router
from .ocr import router as ocr_router
from .admin import router as admin_router
from .design_api import router as design_router

app = FastAPI(title="Design&Lab API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    if request.method == "POST" and request.url.path == "/api/plan/subscribe":
        return JSONResponse(status_code=403, content={"detail": "Самостоятельная смена тарифа отключена."})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), payment=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response

@app.get("/api/health")
def health():
    return {"ok": True}

app.include_router(ai_router)
app.include_router(audit_router)
app.include_router(projects_router)
app.include_router(auth_router)
app.include_router(plans_router)
app.include_router(profile_router)
app.include_router(proxy_router)
app.include_router(ocr_router)
app.include_router(admin_router)
app.include_router(design_router)

_PATCH_SCRIPTS = (
    # Движок дизайн-скиллов. Идёт ПЕРВЫМ: он ставит перехват window.fetch
    # и подмешивает готовую дизайн-систему в system-промпт любой модели,
    # включая те, что вызываются из браузера мимо backend/prompts.py.
    "dl-design-skills.js",
    "models-patch.js", "model-free-set.js", "model-plan-groups.js", "hide-google-models.js",
    "model-access-lock.js", "ai-creative-prompt.js", "plans-patch.js", "plan-lock-ui.js",
    "profile-patch.js", "profile-id-patch.js",
    "ui-cleanup.js", "iframe-cursor-bridge.js", "design-edit-fix.js", "design-text-scale.js",
    "design-inert.js", "session-restore.js",
    "proxy-auth-patch.js", "auth-error-patch.js",
    "seekai-models.js",
    # Единый движок прокрутки. Обязан идти ДО dl-mobile.js: мобильное меню
    # строит пункты поверх уже рабочего window.dlScrollToId / scrollTo2.
    "dl-scroll.js",
    "dl-mobile.js",
    # Закрытие нижнего листа выбора модели: тап по фону, свайп вниз, Escape.
    "dl-mobile-sheet.js",
    "dl-mobile-polish.js",
    "dl-ui-kit.js",
    "dl-fix.js",
    # Мобильный редактор-мессенджер: чат нижним листом, рабочая область сверху.
    "dl-mobile-chat.js",
    # Финальный мобильный фикс-слой: растяжка превью под свёрнутым чатом,
    # рабочая панель кода на телефоне, пересчёт геометрии при повороте.
    "dl-mobile-fix.js",
    # Пересборка герой-композера в настоящий чат. Идёт ПОСЛЕДНИМ:
    # он расставляет узлы поверх всех остальных патчей композера.
    "dl-chat-mobile.js",
    # Самым последним: десктопный рунтайм. Возвращает фоновые анимации на
    # компьютере (мобильные слои глушили их и на десктопе) и держит высоту
    # поля ввода в чате согласованной с текстом.
    "dl-desktop-chat.js",
    # Герой-композер главного экрана: единая структура на всех ширинах,
    # кнопка отправки всегда справа. Идёт после dl-chat-mobile.js.
    "dl-hero-composer.js",
    # Доска + ИИ: дизайн-скиллы в промпте схемы, ремонт JSON, честный фолбэк.
    "dl-board-ai.js",
    # Самым последним: точечные фиксы интерфейса — убрана кнопка установки
    # приложения, подменён undefined в значках моделей, меню обновляется после входа.
    "dl-mobile-fixes.js",
)

# Листы стилей подключаются в конце документа: так они идут после всех
# инлайн-<style> в index.html и переопределяют их без гонки за !important.
_PATCH_STYLES = (
    "dl-design-system.css",
    # Блокировка прокрутки без потери позиции (см. комментарий в файле).
    "dl-scroll.css",
    # Мобильный слой идёт последним: он правит то, что задала дизайн-система.
    "dl-mobile.css",
    # Нижний лист выбора модели — после мобильного слоя.
    "dl-mobile-sheet.css",
    "dl-mobile-polish.css",
    "dl-ui-kit.css",
    "dl-ui-kit-mobile.css",
    "dl-ui-kit-desktop.css",
    "dl-fix.css",
    # Идёт последним: перекрывает десктопную сетку редактора на телефоне.
    "dl-mobile-chat.css",
    # Самый последний слой: убирает пустоту под свёрнутым чатом и делает
    # панель кода полноэкранной на телефоне.
    "dl-mobile-fix.css",
    # Последним: перекрывает flex-direction:column из dl-fix.css.
    "dl-chat-mobile.css",
    # Самым последним: десктопное окно чата (единая шкала кнопок в строке
    # действий) и восстановление фоновых анимаций на компьютере. Ниже по
    # каскаду файлов нет, поэтому мобильные слои его уже не перебивают.
    "dl-desktop-chat.css",
    # Самый последний слой: герой-композер на главном экране.
    "dl-hero-composer.css",
)
_index_cache = None

def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    missing = [
        f'<link rel="stylesheet" href="/{name}">'
        for name in _PATCH_STYLES
        if name not in raw
    ]
    missing += [
        f'<script src="/{name}"></script>'
        for name in _PATCH_SCRIPTS
        if name not in raw
    ]
    if not missing:
        return raw
    patch = "\n".join(missing)
    i = raw.rfind("</body>")
    return raw + patch if i < 0 else raw[:i] + patch + "\n" + raw[i:]

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

if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
