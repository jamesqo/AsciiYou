from fastapi import APIRouter, HTTPException, Depends
import secrets
import time
import jwt
from datetime import datetime, timezone
from settings import settings
from deps import get_huddle_repo, get_participant_repo
from persistence.huddle_repository import HuddleRepository
from models.huddle_info import HuddleInfo
from models.participant_info import ParticipantInfo
from persistence.participant_repository import ParticipantRepository
from models.rest import JoinOk

router = APIRouter()

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

    participant = ParticipantInfo(id=participant_id, role="host")
    huddle = HuddleInfo(
        id=huddle_id,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.fromtimestamp(exp, tz=timezone.utc),
        participants=None,
    )

    await huddle_repo.create(huddle, settings.huddle_ttl_seconds)
    await participant_repo.add(huddle_id, participant)

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
        streaming_token=token,
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
    participant = ParticipantInfo(id=participant_id, role="guest")

    try:
        await participant_repo.add(huddle_id, participant)
    except ValueError:
        raise HTTPException(status_code=404, detail="Huddle not found or expired")
    
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
        streaming_token=token,
    )

