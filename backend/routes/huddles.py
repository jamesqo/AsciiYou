from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, AnyUrl, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Dict, Literal
import secrets
import time
import jwt
from backend.settings import settings


router = APIRouter()

# In-memory store of huddles -> expiry
HUDDLES: Dict[str, float] = {}
TTL_SECONDS = 60 * 60  # 1 hour

class JoinOk(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    ok: bool
    huddle_id: str
    participant_id: str
    role: Literal["host", "guest"]
    huddle_expiry: str
    sdp_negotiation_url: AnyUrl


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
        "exp": int(time.time()) + settings.jwt_ttl_seconds,
    }, settings.jwt_secret, algorithm="HS256")
    return JoinOk(
        ok=True,
        huddle_id=huddle_id,
        participant_id=participant_id,
        role="host",
        huddle_expiry=isotime(exp),
        sdp_negotiation_url=f"{settings.sdp_ws_base}?token={token}",
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
        "exp": int(time.time()) + settings.jwt_ttl_seconds,
    }, settings.jwt_secret, algorithm="HS256")
    return JoinOk(
        ok=True,
        huddle_id=huddle_id,
        participant_id=participant_id,
        role="guest",
        huddle_expiry=isotime(exp),
        sdp_negotiation_url=f"{settings.sdp_ws_base}?token={token}",
    )

