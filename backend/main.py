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
    # Снятие чужих ограничений ширины при растяжке блока в режиме дизайна.
    "design-resize-free.js",
    # Режим дизайна сразу запускает движок редактирования блоков.
    "design-autoarm.js",
    # Чистка следов выделения перед сохранением сайта.
    "design-clean-save.js",
    "design-inert.js", "session-restore.js",
    "proxy-auth-patch.js", "auth-error-patch.js",
    "seekai-models.js",
    # После seekai-models.js: запрет автоподмены модели. Цепочка
    # FALLBACK_ORDER НЕ укорачивается (это дважды выключало запросы
    # целиком) — имя модели правится в теле каждого запроса.
    "model-no-autoswitch.js",
    # Модель по умолчанию: DeepSeek, а на бесплатном тарифе GPT-OSS 120B.
    # Идёт после всех патчей, которые добавляют и разрешают модели.
    "model-default.js",
    # Отмена текущего запроса к модели: квадратик на месте кнопки
    # отправки и Escape. Обрывает всю генерацию, а не одну попытку.
    "request-cancel.js",
    # Сразу за ним: после ручной отмены никаких сообщений об ошибках.
    # Обрыв соединения неотличим от отказа сети, и цепочка пишет
    # «модели недоступны» там, где человек просто нажал стоп.
    "cancel-quiet.js",
    # Порядок моделей в списке: DeepSeek → GLM → Anthropic → OpenAI,
    # внутри компании по возрастанию версии. Идёт после всех патчей,
    # которые добавляют модели, иначе сортировать нечего.
    "model-order.js",
    # Удаление проекта с первой попытки: глушит отложенный автосейв
    # удалённого сайта и чистит местные копии списка.
    "project-delete-fix.js",
    # Сразу за ним: борьба с лишними копиями. Автосейв без id создавал
    # новый проект на каждом срабатывании; теперь id запоминается, а
    # удалённые сайты помнятся между перезагрузками.
    "project-dedupe.js",
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
    # Сразу за ним: жёсткое требование JSON в ответе модели. Без него
    # DeepSeek и другие «разговорчивые» модели отвечают статьёй с
    # заголовками и ссылками, разбор падает, и страница не меняется.
    "board-json-force.js",
    # Журнал доски: в плашке отчёта остаётся только изначальная модель,
    # а не список всех, кого перебрала цепочка. Идёт после dl-board-ai.js.
    "board-log-trim.js",
    # Самым последним: точечные фиксы интерфейса — убрана кнопка установки
    # приложения, подменён undefined в значках моделей, меню обновляется после входа,
    # на телефоне всплывающие окна непрозрачные.
    "dl-mobile-fixes.js",
    # Палитры для сайта пользователя: кнопка выбора цветовой схемы рядом с
    # предпросмотром, мгновенная перекраска сайта в шаблонах и конструкторе.
    "dl-palettes.js",
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


def _version(name: str) -> str:
    """Метка версии файла для адреса подключения.

    Без неё браузер (особенно мобильный Safari и Chrome на Android) держит
    старый .js/.css в кэше и после деплоя показывает прежнее поведение:
    выглядит так, будто правки не выкатились. Меняется файл — меняется адрес.
    """
    try:
        stat = (config.FRONTEND_DIR / name).stat()
        return str(int(stat.st_mtime))[-8:] + "-" + str(stat.st_size)
    except OSError:
        return "0"


def _early_boot() -> str:
    """Ранняя пометка телефонной ширины экрана.

    Класс dl-phone раньше выставлялся скриптами в конце документа, поэтому
    первый кадр на телефоне рисовался десктопной вёрсткой и только потом
    резко перестраивался. Здесь класс ставится до отрисовки тела страницы.
    """
    return (
        "<script>(function(){var d=document.documentElement;"
        "function set(){var phone;try{phone=window.matchMedia('(max-width:760px)').matches;}"
        "catch(e){phone=(window.innerWidth||0)<=760;}"
        "if(phone){d.classList.add('dl-phone');}else{d.classList.remove('dl-phone');}}"
        "set();window.addEventListener('resize',set);"
        "window.addEventListener('orientationchange',set);})();</script>"
    )


def _build_index() -> str:
    raw = (config.FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    styles = [
        f'<link rel="stylesheet" href="/{name}?v={_version(name)}">'
        for name in _PATCH_STYLES
        if name not in raw
    ]
    scripts = [
        f'<script src="/{name}?v={_version(name)}"></script>'
        for name in _PATCH_SCRIPTS
        if name not in raw
    ]

    # Те же листы стилей дублируются в <head>. Адреса совпадают, так что файл
    # скачивается один раз. Копия в шапке блокирует первую отрисовку, поэтому
    # на телефоне сразу видна мобильная вёрстка, а не десктопная. Копия в конце
    # тела остаётся и по-прежнему решает исход каскада.
    head = _early_boot()
    if styles:
        head += "\n" + "\n".join(styles)
    j = raw.find("</head>")
    raw = head + raw if j < 0 else raw[:j] + head + "\n" + raw[j:]

    tail = styles + scripts
    if not tail:
        return raw
    patch = "\n".join(tail)
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
    # Сама страница не кэшируется: в ней лежат адреса со свежими версиями.
    return HTMLResponse(_index_cache, headers={"Cache-Control": "no-store, must-revalidate"})

if config.FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(config.FRONTEND_DIR), html=True), name="frontend")
