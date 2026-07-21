"""Backend tests via Starlette TestClient. No real network: the AI call is mocked."""
import os, tempfile, json, sys

# isolate data dir + ensure no AI key before importing the app
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="dl_test_")
os.environ["AI_API_KEY"] = ""
os.environ["FRONTEND_DIR"] = tempfile.mkdtemp(prefix="dl_fe_")  # empty; mount harmless

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
import backend.main as m
import backend.ai as ai
from backend.audit import audit_html
from backend.ai import extract_html

client = TestClient(m.app)
P=0; F=0
def ok(n,c):
    global P,F
    if c: P+=1; print("  \u2705",n)
    else: F+=1; print("  \u274c",n)

print("\n== extract_html ==")
ok("strips fences", extract_html("hey ```html\n<!DOCTYPE html><html></html>\n```").startswith("<!DOCTYPE html>"))
ok("cuts prose after </html>", extract_html("<html>x</html>\n\nHope this helps").endswith("</html>"))
ok("empty->empty", extract_html("")=="")

print("\n== /api/health ==")
r = client.get("/api/health")
ok("health 200", r.status_code==200)
ok("ai_ready false (no key)", r.json()["ai_ready"] is False)

print("\n== /api/ai without key -> 503 ==")
r = client.post("/api/ai", json={"mode":"scratch","message":"кофейня"})
ok("503 when no key", r.status_code==503)

print("\n== /api/ai happy path (mocked provider) ==")
DOC = "<!DOCTYPE html><html lang='ru'><head><meta name='viewport' content='w'><title>Кафе</title></head><body><h1>Кофе</h1></body></html>"
class FakeResp:
    status_code=200
    def json(self): return {"choices":[{"message":{"content":"Готово!\n```html\n"+DOC+"\n```"}}]}
    text=""
class FakeClient:
    def __init__(self,*a,**k): pass
    async def __aenter__(self): return self
    async def __aexit__(self,*a): return False
    async def post(self,*a,**k): return FakeResp()
ai.config.AI_API_KEY = "test-key"          # pretend a key is configured
ai.httpx.AsyncClient = FakeClient          # mock outbound call
r = client.post("/api/ai", json={"mode":"scratch","message":"сделай лендинг кофейни"})
ok("ai 200", r.status_code==200)
ok("returns extracted html doc", r.json()["html"].startswith("<!DOCTYPE html>") and "Кофе" in r.json()["html"])
ai.config.AI_API_KEY = ""                  # reset

print("\n== /api/projects CRUD ==")
r = client.post("/api/projects", json={"name":"Мой сайт","html":"<h1>hi</h1>","kind":"scratch"})
ok("create 200", r.status_code==200)
pid = r.json()["id"]
ok("has id", bool(pid))
r = client.get("/api/projects")
ok("list contains it", any(p["id"]==pid for p in r.json()))
r = client.post("/api/projects", json={"id":pid,"name":"Переименован","html":"<h1>v2</h1>","kind":"scratch"})
ok("update keeps id", r.json()["id"]==pid and r.json()["name"]=="Переименован")
r = client.get(f"/api/projects/{pid}")
ok("get returns html v2", r.json()["html"]=="<h1>v2</h1>")
r = client.delete(f"/api/projects/{pid}")
ok("delete 204", r.status_code==204)
r = client.get(f"/api/projects/{pid}")
ok("gone -> 404", r.status_code==404)
r = client.get("/api/projects/../../etc/passwd")
ok("path traversal blocked", r.status_code in (400,404))

print("\n== /api/audit ==")
leak = "<html><body><h1>a</h1><script>var k='sk-or-v1-"+("a"*40)+"'</script></body></html>"
r = client.post("/api/audit", json={"html":leak})
j = r.json()
ok("audit 200", r.status_code==200)
ok("flags leaked key high", any(i["sev"]=="high" and ("ключ" in i["title"] or "секрет" in i["title"]) for i in j["items"]))
ok("score < 90", j["score"] < 90)
# parity sanity vs direct function
ok("route matches audit_html()", j["score"]==audit_html(leak)["score"])

print("\n----------------------------------------")
print(f"PASS: {P}   FAIL: {F}")
sys.exit(1 if F else 0)
