from __future__ import annotations

from redis.asyncio import from_url  # type: ignore[import-not-found]

from settings import settings
from persistence.huddle_repository import RedisHuddleRepository, HuddleRepository
from persistence.participant_repository import RedisParticipantRepository, ParticipantRepository


_redis = from_url(settings.redis_url, decode_responses=False)
_huddle_repo: HuddleRepository = RedisHuddleRepository(_redis)
_participant_repo: ParticipantRepository = RedisParticipantRepository(_redis)


def get_huddle_repo() -> HuddleRepository:
    return _huddle_repo

def get_participant_repo() -> ParticipantRepository:
    return _participant_repo

