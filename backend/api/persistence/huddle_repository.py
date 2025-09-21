from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from redis.asyncio import Redis

from models.huddle import Huddle


class HuddleRepository(ABC):
    @abstractmethod
    async def create(self, huddle: Huddle, ttl_seconds: int) -> None:
        """Creates a new Huddle."""
        ...

    @abstractmethod
    async def get(self, huddle_id: str) -> Optional[Huddle]:
        """Gets a Huddle from its ID."""
        ...


    @abstractmethod
    async def delete(self, huddle_id: str) -> None:
        """Deletes a Huddle."""
        ...


class RedisHuddleRepository(HuddleRepository):
    def __init__(self, redis: Redis):
        self._redis = redis

    def _key(self, hid: str) -> str:
        return f"huddles:{hid}"

    async def create(self, huddle: Huddle, ttl_seconds: int) -> None:
        await self._redis.set(self._key(huddle.id), huddle.model_dump_json(by_alias=True), ex=ttl_seconds, nx=True)

    async def get(self, huddle_id: str) -> Optional[Huddle]:
        raw = await self._redis.get(self._key(huddle_id))
        if not raw:
            return None
        return Huddle.model_validate_json(raw)


    async def delete(self, huddle_id: str) -> None:
        await self._redis.delete(self._key(huddle_id))


