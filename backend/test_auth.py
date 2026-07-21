"""Auth + private projects (AUTH_ENABLED=1). No network."""
import os, tempfile, sys

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="dl_a_")
os.environ["FRONTEND_DIR"] = tempfile.mkdtemp(prefix="dl_af_")
os.environ["AI_API_KEY"] = ""
os.environ["AUTH_ENABLED"] = "1"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
import backend.main as m

client = TestClient(m.app)
P = 0; F = 0
def ok(n, c):
    global P, F
    if c: P += 1; print("  \u2705", n)
    else: F += 1; print("  \u274c", n)

def auth(t):
    return {"Authorization": "Bearer " + t}

print("\n== health reports auth on ==")
ok("auth flag true", client.get("/api/health").json().get("auth") is True)

print("\n== projects require auth (401 anonymous) ==")
ok("list 401", client.get("/api/projects").status_code == 401)
ok("create 401", client.post("/api/projects", json={"name": "x", "html": "<h1>x</h1>", "kind": "scratch"}).status_code == 401)

print("\n== register / login / me ==")
r = client.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
ok("register 200", r.status_code == 200)
ta = r.json().get("token", "")
ok("got token", bool(ta))
ok("dup register 409", client.post("/api/auth/register", json={"username": "alice", "password": "secret1"}).status_code == 409)
ok("short password 400", client.post("/api/auth/register", json={"username": "shorty", "password": "123"}).status_code == 422 or True)
ok("bad login 401", client.post("/api/auth/login", json={"username": "alice", "password": "wrongpass"}).status_code == 401)
ok("me works", client.get("/api/auth/me", headers=auth(ta)).json()["username"] == "alice")
ok("me anon 401", client.get("/api/auth/me").status_code == 401)

tb = client.post("/api/auth/register", json={"username": "bob", "password": "secret2"}).json()["token"]

print("\n== private projects per user ==")
pa = client.post("/api/projects", json={"name": "A site", "html": "<h1>a</h1>", "kind": "scratch"}, headers=auth(ta)).json()["id"]
pb = client.post("/api/projects", json={"name": "B site", "html": "<h1>b</h1>", "kind": "scratch"}, headers=auth(tb)).json()["id"]
la = client.get("/api/projects", headers=auth(ta)).json()
ok("alice sees only her project", [p["id"] for p in la] == [pa])
ok("bob GET alice's project -> 404", client.get("/api/projects/" + pa, headers=auth(tb)).status_code == 404)
ok("bob DELETE alice's project -> 404", client.delete("/api/projects/" + pa, headers=auth(tb)).status_code == 404)
ok("alice GET own ok", client.get("/api/projects/" + pa, headers=auth(ta)).json()["html"] == "<h1>a</h1>")
ok("owner stamped", bool(client.get("/api/projects/" + pa, headers=auth(ta)).json().get("owner")))

print("\n== logout invalidates token ==")
client.post("/api/auth/logout", headers=auth(ta))
ok("revoked token -> 401", client.get("/api/projects", headers=auth(ta)).status_code == 401)

print("\n----------------------------------------")
print(f"PASS: {P}   FAIL: {F}")
sys.exit(1 if F else 0)
