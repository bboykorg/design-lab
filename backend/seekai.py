"""SeekAI (https://seekai.cc) — резервный и основной шлюз к моделям.

Зачем нужен отдельный модуль:
- ключи SeekAI крутятся по кругу (round-robin);
- часть моделей уже есть на сайте через другие шлюзы. Для них SeekAI
  включается только тогда, когда «родной» шлюз перестал отвечать
  (кончились лимиты, ключ отозван, провайдер лёг);
- часть моделей есть только у SeekAI — они идут напрямую.

ИМЕНА МОДЕЛЕЙ. Идентификаторы на сайте и в каталоге SeekAI совпадают не всегда:
у них часть моделей через точку (gpt-5.6, gpt-5.6-sol), а часть — через дефис
(gpt-5-6-terra). Поэтому ЛЮБОЕ наше имя переводится через target_model() перед
отправкой — и для резерва, и для собственных моделей SeekAI. Раньше свои
модели уходили как есть, и gpt-5-6 / gpt-5-6-sol получали «model not found»,
а сайт молча уходил на следующую модель из цепочки.

Ключи берутся ТОЛЬКО из переменных окружения SEEKAI_API_KEYS / SEEKAI_API_KEY,
точно так же, как у остальных провайдеров. В коде ключей нет.
Если переменная не задана, шлюз просто выключен.

Состояние «шлюз выдохся» держим в памяти процесса с TTL: как только основной
шлюз вернул 401/402/403/429 или 5xx, помечаем пару (провайдер, модель) как
выдохшуюся и следующие запросы сразу уходят в SeekAI, не тратя время на
заведомо неудачный вызов. Через COOLDOWN секунд снова пробуем основной шлюз.
"""
import os
import threading
import time

BASE_URL = os.getenv("SEEKAI_BASE_URL", "https://seekai.cc/v1").rstrip("/")
ENDPOINT = BASE_URL + "/chat/completions"
ENV_NAMES = "SEEKAI_API_KEYS,SEEKAI_API_KEY"

# Модели, которые есть ТОЛЬКО у SeekAI — сразу идут туда.
# Это имена НА САЙТЕ; как они называются у провайдера — см. FALLBACK_MODEL.
OWN_MODELS = {
    "gpt-5-5",
    "gpt-5-6",
    "gpt-5-6-terra",
    "gpt-5-6-sol",
    "gpt-5-6-luna",
    "grok-4-5",
    "deepseek-v4-pro",
    "claude-fable-5",
    "claude-opus-4-7",
}

# Модель на сайте -> как она называется в SeekAI.
# Здесь же лежат исправления расхождений в написании (точка против дефиса),
# сверенные с живым каталогом /v1/models.
FALLBACK_MODEL = {
    "claude-opus-4-8": "claude-opus-4-8",
    "claude-opus-4-8-thinking": "claude-opus-4-8",
    "claude-opus-5": "claude-opus-5",
    "claude-opus-5-thinking": "claude-opus-5",
    "claude-sonnet-5": "claude-sonnet-5",
    "claude-fable-5": "claude-fable-5",
    "claude-opus-4-7": "claude-opus-4-7",
    "deepseek-v4-flash": "deepseek-v4-flash",
    "DeepSeek-V4-Flash": "deepseek-v4-flash",
    "deepseek-v4-pro": "deepseek-v4-pro",
    # У SeekAI эти две — через точку.
    "gpt-5.6": "gpt-5.6",
    "gpt-5-6": "gpt-5.6",
    "gpt-5.6-sol": "gpt-5.6-sol",
    "gpt-5-6-sol": "gpt-5.6-sol",
    # А эти две — через дефис.
    "gpt-5.6-terra": "gpt-5-6-terra",
    "gpt-5-6-terra": "gpt-5-6-terra",
    "gpt-5.6-luna": "gpt-5-6-luna",
    "gpt-5-6-luna": "gpt-5-6-luna",
    "gpt-5-5": "gpt-5-5",
    "grok-4-5": "grok-4-5",
    "glm-5.2": "glm-5-2",
    "kiwi::glm-5.2": "glm-5-2",
}

# Коды, после которых основной шлюз считается «выдохшимся».
EXHAUSTED_CODES = frozenset({401, 402, 403, 408, 429, 500, 502, 503, 504, 529})
COOLDOWN = float(os.getenv("SEEKAI_FAILOVER_COOLDOWN", "900"))

_exhausted = {}
_lock = threading.Lock()


def keys():
    """Ключи SeekAI из окружения. Пусто — значит шлюз выключен."""
    found = []
    for name in ENV_NAMES.split(","):
        found += [key.strip() for key in os.getenv(name.strip(), "").split(",") if key.strip()]
    return found


def enabled() -> bool:
    return bool(keys())


def _slot(provider: str, model: str) -> str:
    return (provider or "?") + "|" + (model or "?")


def mark_exhausted(provider: str, model: str) -> None:
    """Запомнить, что основной шлюз для этой модели сейчас не работает."""
    if provider == "seekai":
        return
    with _lock:
        _exhausted[_slot(provider, model)] = time.time() + COOLDOWN


def mark_alive(provider: str, model: str) -> None:
    """Основной шлюз снова ответил — снимаем пометку."""
    if provider == "seekai":
        return
    with _lock:
        _exhausted.pop(_slot(provider, model), None)


def is_exhausted(provider: str, model: str) -> bool:
    with _lock:
        until = _exhausted.get(_slot(provider, model), 0)
        if not until:
            return False
        if until <= time.time():
            _exhausted.pop(_slot(provider, model), None)
            return False
        return True


def target_model(model: str) -> str:
    """Имя модели в SeekAI или пустая строка, если подмены нет."""
    return FALLBACK_MODEL.get(model, "") or (model if model in OWN_MODELS else "")


def can_take_over(model: str) -> bool:
    return bool(enabled() and target_model(model))


def status():
    """Для диагностики в /api/seekai/check."""
    now = time.time()
    with _lock:
        active = {slot: round(until - now) for slot, until in _exhausted.items() if until > now}
    return {
        "keys": len(keys()),
        "base": BASE_URL,
        "ownModels": sorted(OWN_MODELS),
        "failoverModels": sorted(FALLBACK_MODEL),
        "cooldownSeconds": COOLDOWN,
        "exhaustedNow": active,
    }
