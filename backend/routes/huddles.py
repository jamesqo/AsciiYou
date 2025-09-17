from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, AnyUrl
from typing import Dict, Set, Literal
import secrets
import time
import jwt
from backend.config import JWT_SECRET, JWT_TTL_SECONDS


router = APIRouter()

# In-memory store of huddles -> expiry
HUDDLES: Dict[str, float] = {}
TTL_SECONDS = 60 * 60  # 1 hour

# TODO: refactor to use snake_case?
# We should find some way to reconcile this on the React side instead
class JoinOk(BaseModel):
    ok: bool
    huddleId: str
    participantId: str
    role: Literal["host", "guest"]
    huddleExpiry: str
    sdpNegotiationUrl: AnyUrl


class SDPMessage(BaseModel):
    type: Literal["offer", "answer"]
    sdp: str


def isotime(seconds: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(seconds))


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


@router.post("/huddles", response_model=JoinOk)
def create_huddle() -> JoinOk:
    huddle_id = new_id("h")
    participant_id = new_id("p")
    exp = time.time() + TTL_SECONDS
    HUDDLES[huddle_id] = exp
    token = jwt.encode({
        "hid": huddle_id,
        "pid": participant_id,
        "role": "host",
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_TTL_SECONDS,
    }, JWT_SECRET, algorithm="HS256")
    return JoinOk(
        ok=True,
        huddleId=huddle_id,
        participantId=participant_id,
        role="host",
        huddleExpiry=isotime(exp),
        sdpNegotiationUrl=f"ws://localhost:3000/sdp?token={token}",
    )


@router.post("/huddles/{huddle_id}/join", response_model=JoinOk)
def join_huddle(huddle_id: str) -> JoinOk:
    exp = HUDDLES.get(huddle_id)
    if not exp or exp < time.time():
        raise HTTPException(status_code=404, detail="Huddle not found or expired")
    participant_id = new_id("p")
    token = jwt.encode({
        "hid": huddle_id,
        "pid": participant_id,
        "role": "guest",
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_TTL_SECONDS,
    }, JWT_SECRET, algorithm="HS256")
    return JoinOk(
        ok=True,
        huddleId=huddle_id,
        participantId=participant_id,
        role="guest",
        huddleExpiry=isotime(exp),
        sdpNegotiationUrl=f"ws://localhost:3000/sdp?token={token}",
    )

