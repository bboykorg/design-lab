"""/api/ai — proxy to an OpenAI-compatible chat API. Keys stay on the server.

Two endpoints (только для вошедших пользователей):
- POST /api/ai         → single JSON response {html, model, say}
- POST /api/ai/stream  → Server-Sent Events: {"delta": "..."} chunks, then
                          a final {"done": true, "html": "...", "say": "..."}.

Оба эндпоинта расходуют дневной лимит тарифа, как и /api/proxy, иначе Free
мог бы генерировать без ограничений через встроенную модель.
"""
import json
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from . import config
from .auth import require_user
from .models import AIRequest, AIResponse
from .plans import consume_edit
from .prompts import build_system_prompt, build_user_message
from .ratelimit import guard

router = APIRouter(prefix="/api", tags=["ai"])


class ProviderError(Exception):
    def __init__(self, status, detail):
        self.status = status
        self.detail = detail
        super().__init__(f"{status}: {detail}")


def extract_html(s: str) -> str:
    """Robustly pull a full HTML document out of a possibly chatty answer."""
    if not s:
        return ""
    s = str(s)
    fence = re.search(r"```(?:html)?\s*([\s\S]*?)```", s, re.I)
    if fence:
        s = fence.group(1)
    m = re.search(r"<!DOCTYPE html|<html[\s>]", s, re.I)
    if m:
        s = s[m.start():]
    end = re.search(r"</html>", s, re.I)
    if end:
        s = s[: end.end()]
    return s.strip()


def _user_content(mode: str, message: str, html: str, images):
    text = build_user_message(mode, message, html)
    if images:
        content = [{"type": "text", "text": text}]
        for url in images[:4]:
            if isinstance(url, str) and url.startswith("data:image"):
                content.append({"type": "image_url", "image_url": {"url": url}})
        return content
    return text


def _payload(req: AIRequest, stream: bool):
    return {
        "model": config.AI_MODEL,
        "messages": [
            {"role": "system", "content": build_system_prompt(req.mode)},
            {"role": "user", "content": _user_content(req.mode, req.message, req.html, req.images)},
        ],
        "temperature": config.AI_TEMPERATURE,
        "max_tokens": config.AI_MAX_TOKENS,
        "stream": stream,
    }


def _headers():
    return {"Authorization": f"Bearer {config.AI_API_KEY}", "Content-Type": "application/json"}


def _sse(obj) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"


@router.get("/models")
def list_models():
    """Только флаг готовности — без адреса провайдера и имени модели."""
    return {"ready": config.has_ai_key()}


@router.post("/ai", response_model=AIResponse)
async def generate(req: AIRequest, request: Request, user=Depends(require_user)):
    guard("ai", request, user)
    if not config.has_ai_key():
        raise HTTPException(status_code=503, detail="AI_API_KEY не задан на сервере (.env)")
    consume_edit(user)

    url = config.AI_BASE_URL + "/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=config.AI_TIMEOUT) as client:
            r = await client.post(url, json=_payload(req, False), headers=_headers())
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Не удалось связаться с провайдером ИИ: {e}")

    if r.status_code == 429:
        raise HTTPException(status_code=429, detail="Лимит запросов провайдера (429). Попробуй позже.")
    if r.status_code in (401, 403):
        raise HTTPException(status_code=502, detail="Провайдер отклонил ключ (проверь AI_API_KEY).")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Провайдер вернул {r.status_code}: {r.text[:300]}")

    data = r.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="Пустой ответ модели")

    html = extract_html(content)
    if not html or len(html) < 60:
        return AIResponse(html="", model=config.AI_MODEL, say=content[:800])
    return AIResponse(html=html, model=config.AI_MODEL, say="")


async def _provider_deltas(payload, headers, url):
    """Yield content deltas from an OpenAI-compatible streaming endpoint."""
    async with httpx.AsyncClient(timeout=config.AI_TIMEOUT) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as r:
            if r.status_code >= 400:
                body = (await r.aread()).decode("utf-8", "ignore")
                raise ProviderError(r.status_code, body[:300])
            async for line in r.aiter_lines():
                if not line:
                    continue
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                except Exception:
                    continue
                try:
                    delta = obj["choices"][0]["delta"].get("content")
                except (KeyError, IndexError, TypeError, AttributeError):
                    delta = None
                if delta:
                    yield delta


@router.post("/ai/stream")
async def generate_stream(req: AIRequest, request: Request, user=Depends(require_user)):
    guard("ai", request, user)
    if not config.has_ai_key():
        raise HTTPException(status_code=503, detail="AI_API_KEY не задан на сервере (.env)")
    consume_edit(user)

    url = config.AI_BASE_URL + "/chat/completions"
    payload, headers = _payload(req, True), _headers()

    async def gen():
        acc = ""
        try:
            async for delta in _provider_deltas(payload, headers, url):
                acc += delta
                yield _sse({"delta": delta})
        except ProviderError as e:
            yield _sse({"error": f"{e.status}: {e.detail}"})
            return
        except Exception as e:  # network etc.
            yield _sse({"error": str(e)[:300]})
            return
        html = extract_html(acc)
        if html and len(html) >= 60:
            yield _sse({"done": True, "html": html, "model": config.AI_MODEL})
        else:
            yield _sse({"done": True, "html": "", "say": acc[:800], "model": config.AI_MODEL})

    return StreamingResponse(gen(), media_type="text/event-stream")
