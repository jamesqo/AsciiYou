from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, HttpUrl
from typing import Dict
import secrets
import time
from typing import Literal
from aiortc import RTCPeerConnection, RTCSessionDescription


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
    role: str  # "host" | "guest"
    huddleExpiry: str
    sdpNegotiationUrl: HttpUrl


class SDPMessage(BaseModel):
    type: Literal["offer", "answer"]
    sdp: str


def expiry_iso(ttl: int = TTL_SECONDS) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + ttl))


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


@router.post("/huddles", response_model=JoinOk)
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
        sdpNegotiationUrl=f"TODO",
    )


@router.post("/huddles/{huddle_id}/join", response_model=JoinOk)
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
        sdpNegotiationUrl=f"TODO",
    )
