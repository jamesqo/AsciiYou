from __future__ import annotations

from redis.asyncio import from_url  # type: ignore[import-not-found]

from backend.settings import settings
from backend.persistence.huddles import RedisHuddleRepository, HuddleRepository


_redis = from_url(settings.redis_url, decode_responses=False)
_huddle_repo: HuddleRepository = RedisHuddleRepository(_redis)


def get_huddle_repo() -> HuddleRepository:
    return _huddle_repo


