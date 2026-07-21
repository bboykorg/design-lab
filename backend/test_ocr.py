"""OCR tests: /api/ocr and AI-flow injection (OCR.space mocked, no network)."""
import os, tempfile, sys

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="dl_o_")
os.environ["FRONTEND_DIR"] = tempfile.mkdtemp(prefix="dl_of_")
os.environ["AI_API_KEY"] = ""

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
import backend.main as m
import backend.ocr as ocr
import backend.ai as ai

client = TestClient(m.app)
P = 0; F = 0
def ok(n, c):
    global P, F
    if c: P += 1; print("  \u2705", n)
    else: F += 1; print("  \u274c", n)

PIX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"


class FakeResp:
    def __init__(self, payload, status=200):
        self._p = payload; self.status_code = status; self.text = str(payload)
    def json(self):
        return self._p


class FakeClient:
    """Mimics httpx.AsyncClient; returns a canned OCR.space response."""
    payload = {"IsErroredOnProcessing": False, "ParsedResults": [{"ParsedText": "Кнопка: Купить\nЦена 990"}]}
    def __init__(self, *a, **k):
        pass
    async def __aenter__(self):
        return self
    async def __aexit__(self, *a):
        return False
    async def post(self, url, data=None, **k):
        return FakeResp(self.payload)


ocr.httpx.AsyncClient = FakeClient  # mock outbound OCR call

print("\n== /api/ocr happy path (OCR.space mocked) ==")
r = client.post("/api/ocr", json={"images": [PIX]})
ok("ocr 200", r.status_code == 200)
j = r.json() if r.status_code == 200 else {}
ok("ok flag true", j.get("ok") is True)
ok("text recognized", "Купить" in j.get("text", ""))
ok("per_image length matches", len(j.get("per_image", [])) == 1)

print("\n== /api/ocr rejects empty images ==")
r = client.post("/api/ocr", json={"images": []})
ok("422 on empty", r.status_code == 422)

print("\n== /api/ocr surfaces OCR.space error ==")
class ErrClient(FakeClient):
    payload = {"IsErroredOnProcessing": True, "ErrorMessage": ["bad image"]}
ocr.httpx.AsyncClient = ErrClient
r = client.post("/api/ocr", json={"images": [PIX]})
ok("502 on provider error", r.status_code == 502)
ocr.httpx.AsyncClient = FakeClient

print("\n== AI flow folds OCR text into the prompt for every model ==")
captured = {}
def fake_payload(req, stream):
    captured["message"] = req.message
    return {"model": "x", "messages": [{"role": "user", "content": req.message}], "stream": stream}

class DualResp:
    def __init__(self, payload):
        self._p = payload; self.status_code = 200; self.text = str(payload)
    def json(self):
        return self._p

class DualClient:
    """One fake httpx client for BOTH calls (httpx module is shared): the OCR
    call uses data=, the model call uses json=."""
    def __init__(self, *a, **k):
        pass
    async def __aenter__(self):
        return self
    async def __aexit__(self, *a):
        return False
    async def post(self, url, data=None, json=None, headers=None, **k):
        if data is not None:  # OCR.space call
            return DualResp(FakeClient.payload)
        return DualResp({"choices": [{"message": {"content": "<!DOCTYPE html><html><head><title>t</title></head><body><h1>ok</h1></body></html>"}}]})

ai.config.AI_API_KEY = "test-key"
ai._payload = fake_payload
ocr.httpx.AsyncClient = DualClient  # shared httpx module → covers OCR and model calls
r = client.post("/api/ai", json={"mode": "edit", "message": "сделай как на скрине", "html": "<html></html>", "images": [PIX]})
ok("ai 200 with image", r.status_code == 200)
ok("OCR text injected into model message", "Купить" in captured.get("message", ""))
ai.config.AI_API_KEY = ""

print("\n----------------------------------------")
print(f"PASS: {P}   FAIL: {F}")
sys.exit(1 if F else 0)
