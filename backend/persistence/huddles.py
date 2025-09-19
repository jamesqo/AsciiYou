from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from redis.asyncio import Redis  # type: ignore[import-not-found]

from backend.models import Huddle, Participant


class HuddleRepository(ABC):
    @abstractmethod
    async def create(self, huddle: Huddle, ttl_seconds: int) -> None:
        ...

    @abstractmethod
    async def get(self, huddle_id: str) -> Optional[Huddle]:
        ...

    @abstractmethod
    async def upsert_participant(self, huddle_id: str, participant: Participant) -> None:
        ...

    @abstractmethod
    async def delete(self, huddle_id: str) -> None:
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

    async def upsert_participant(self, huddle_id: str, participant: Participant) -> None:
        key = self._key(huddle_id)
        async with self._redis.pipeline(transaction=True) as pipe:
            while True:
                try:
                    await pipe.watch(key)
                    raw = await pipe.get(key)
                    if not raw:
                        await pipe.reset()
                        return
                    h = Huddle.model_validate_json(raw)
                    h.participants[participant.id] = participant
                    pipe.multi()
                    pipe.set(key, h.model_dump_json(by_alias=True), keepttl=True)
                    await pipe.execute()
                    break
                except Exception:
                    continue
                finally:
                    await pipe.reset()

    async def delete(self, huddle_id: str) -> None:
        await self._redis.delete(self._key(huddle_id))


