from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from typing import Dict
import secrets
import time


class JoinOk(BaseModel):
    ok: bool
    huddleId: str
    participantId: str
    role: str  # "host" | "guest"
    huddleExpiry: str
    signalingWs: HttpUrl


app = FastAPI(title="AsciiYou Backend", version="0.1.0")

# Allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# In-memory store of huddles -> expiry
HUDDLES: Dict[str, float] = {}
TTL_SECONDS = 60 * 60  # 1 hour


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def expiry_iso(ttl: int = TTL_SECONDS) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + ttl))


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


@app.post("/huddles", response_model=JoinOk)
def create_huddle() -> JoinOk:
    huddle_id = new_id("h")
    participant_id = new_id("p")
    HUDDLES[huddle_id] = time.time() + TTL_SECONDS
    return JoinOk(
        ok=True,
        huddleId=huddle_id,
        participantId=participant_id,
        role="host",
        huddleExpiry=expiry_iso(),
        signalingWs="ws://localhost:8765/ws",  # placeholder signaling URL
    )


@app.post("/huddles/{huddle_id}/join", response_model=JoinOk)
def join_huddle(huddle_id: str) -> JoinOk:
    exp = HUDDLES.get(huddle_id)
    if not exp or exp < time.time():
        raise HTTPException(status_code=404, detail="Huddle not found or expired")
    participant_id = new_id("p")
    return JoinOk(
        ok=True,
        huddleId=huddle_id,
        participantId=participant_id,
        role="guest",
        huddleExpiry=expiry_iso(int(exp - time.time())),
        signalingWs="ws://localhost:8765/ws",
    )


# Health check
@app.get("/health")
def health():
    return {"ok": True, "now": now_iso()}


