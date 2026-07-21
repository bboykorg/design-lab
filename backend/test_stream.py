"""Streaming endpoint tests: /api/ai/stream (provider mocked, no network)."""
import os, tempfile, sys, json

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="dl_s_")
os.environ["FRONTEND_DIR"] = tempfile.mkdtemp(prefix="dl_sf_")
os.environ["AI_API_KEY"] = ""

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
import backend.main as m
import backend.ai as ai
from backend.ai import ProviderError

client = TestClient(m.app)
P = 0; F = 0
def ok(n, c):
    global P, F
    if c: P += 1; print("  \u2705", n)
    else: F += 1; print("  \u274c", n)

def events(text):
    out = []
    for block in text.split("\n\n"):
        line = next((l for l in block.split("\n") if l.startswith("data:")), None)
        if not line:
            continue
        try:
            out.append(json.loads(line[5:].strip()))
        except Exception:
            pass
    return out

print("\n== /api/ai/stream without key -> 503 ==")
r = client.post("/api/ai/stream", json={"mode": "scratch", "message": "кофейня"})
ok("503 no key", r.status_code == 503)

print("\n== /api/ai/stream happy path (provider mocked) ==")
DOC = "<!DOCTYPE html><html lang='ru'><head><meta name='viewport' content='w'><title>Кафе</title></head><body><h1>Кофе</h1></body></html>"
CHUNKS = ["Готово!\n```html\n", DOC[:40], DOC[40:], "\n```"]
async def fake_deltas(payload, headers, url):
    for c in CHUNKS:
        yield c
ai.config.AI_API_KEY = "test-key"
ai._provider_deltas = fake_deltas
r = client.post("/api/ai/stream", json={"mode": "scratch", "message": "лендинг кофейни"})
ok("stream 200", r.status_code == 200)
ok("content-type event-stream", "text/event-stream" in r.headers.get("content-type", ""))
evs = events(r.text)
ok("has delta events", any("delta" in e for e in evs))
done = [e for e in evs if e.get("done")]
ok("exactly one done event", len(done) == 1)
ok("final html is a full doc with Кофе", bool(done) and done[0]["html"].startswith("<!DOCTYPE html>") and "Кофе" in done[0]["html"])
ai.config.AI_API_KEY = ""

print("\n== /api/ai/stream surfaces provider error ==")
async def fail_deltas(payload, headers, url):
    raise ProviderError(429, "rate limited")
    yield  # makes this an async generator
ai.config.AI_API_KEY = "test-key"
ai._provider_deltas = fail_deltas
r = client.post("/api/ai/stream", json={"mode": "scratch", "message": "x"})
ok("error event present", any("error" in e for e in events(r.text)))
ai.config.AI_API_KEY = ""

print("\n----------------------------------------")
print(f"PASS: {P}   FAIL: {F}")
sys.exit(1 if F else 0)
