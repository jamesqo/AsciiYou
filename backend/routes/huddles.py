from fastapi import APIRouter, HTTPException, Depends
import secrets
import time
import jwt
from datetime import datetime, timezone
from backend.settings import settings
from backend.deps import get_huddle_repo, get_participant_repo
from backend.persistence.huddle_repository import HuddleRepository
from backend.models.huddle import Huddle
from backend.models.participant import Participant
from backend.persistence.participant_repository import ParticipantRepository
from backend.models.join_ok import JoinOk

 


router = APIRouter()

# Deprecated in-memory storage; TTL is governed by settings and Redis key expiry

def isotime(seconds: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(seconds))


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12)}"


@router.post("/huddles", response_model=JoinOk)
async def create_huddle(
    huddle_repo: HuddleRepository = Depends(get_huddle_repo),
    participant_repo: ParticipantRepository = Depends(get_participant_repo)
) -> JoinOk:

    huddle_id = new_id("h")
    participant_id = new_id("p")
    exp = time.time() + settings.huddle_ttl_seconds

    participant = Participant(id=participant_id, role="host")
    huddle = Huddle(
        id=huddle_id,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
        participants=None,
    )

    await huddle_repo.create(huddle, settings.huddle_ttl_seconds)
    await participant_repo.add(huddle_id, participant, settings.huddle_ttl_seconds)

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
        sdp_token=token,
    )


@router.post("/huddles/{huddle_id}/join", response_model=JoinOk)
async def join_huddle(
    huddle_id: str,
    huddle_repo: HuddleRepository = Depends(get_huddle_repo),
    participant_repo: ParticipantRepository = Depends(get_participant_repo)
) -> JoinOk:

    h = await huddle_repo.get(huddle_id)
    if not h:
        raise HTTPException(status_code=404, detail="Huddle not found or expired")

    participant_id = new_id("p")
    participant = Participant(id=participant_id, role="guest")

    await participant_repo.add(huddle_id, participant, int((h.expires_at.timestamp() - time.time()) or 0))
    
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
        sdp_token=token,
    )

