from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, AnyUrl, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Dict, Literal
import secrets
import time
import jwt
from datetime import datetime
from backend.settings import settings
from backend.deps import get_huddle_repo
from backend.persistence.huddles import HuddleRepository
from backend.models import Huddle, JoinOk, Participant


router = APIRouter()

# In-memory store of huddles -> expiry
HUDDLES: Dict[str, float] = {}
TTL_SECONDS = 60 * 60  # 1 hour

def isotime(seconds: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(seconds))


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


@router.post("/huddles", response_model=JoinOk)
async def create_huddle(repo: HuddleRepository = Depends(get_huddle_repo)) -> JoinOk:
    huddle_id = new_id("h")
    participant_id = new_id("p")
    exp = time.time() + TTL_SECONDS
    # persist huddle with TTL
    await repo.create(Huddle(
        id=huddle_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcfromtimestamp(exp),
        participants={participant_id: Participant(id=participant_id, role="host")},
        sdp_ws_base=settings.sdp_ws_base,
    ), settings.huddle_ttl_seconds)
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
async def join_huddle(huddle_id: str, repo: HuddleRepository = Depends(get_huddle_repo)) -> JoinOk:
    h = await repo.get(huddle_id)
    if not h:
        raise HTTPException(status_code=404, detail="Huddle not found or expired")
    participant_id = new_id("p")
    await repo.upsert_participant(huddle_id, Participant(id=participant_id, role="guest"))
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
        huddle_expiry=isotime(h.expires_at.timestamp()),
        sdp_negotiation_url=f"{settings.sdp_ws_base}?token={token}",
    )

