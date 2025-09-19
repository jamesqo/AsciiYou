from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from redis.asyncio import Redis  # type: ignore[import-not-found]

from backend.models.participant import Participant


class ParticipantRepository(ABC):
    @abstractmethod
    async def add(self, huddle_id: str, participant: Participant, ttl_seconds: int) -> None:
        ...

    @abstractmethod
    async def get(self, huddle_id: str, participant_id: str) -> Optional[Participant]:
        ...

    @abstractmethod
    async def list_by_huddle(self, huddle_id: str) -> List[Participant]:
        ...

    @abstractmethod
    async def delete(self, huddle_id: str, participant_id: str) -> None:
        ...


class RedisParticipantRepository(ParticipantRepository):
    def __init__(self, redis: Redis):
        self._redis = redis

    def _p_key(self, huddle_id: str, participant_id: str) -> str:
        return f"huddles:{huddle_id}:participants:{participant_id}"

    def _set_key(self, huddle_id: str) -> str:
        return f"huddles:{huddle_id}:participants"

    async def add(self, huddle_id: str, participant: Participant, ttl_seconds: int) -> None:
        pkey = self._p_key(huddle_id, participant.id)
        skey = self._set_key(huddle_id)
        # store participant object and index it in the huddle's participant set
        await self._redis.set(pkey, participant.model_dump_json(by_alias=True), ex=ttl_seconds)
        await self._redis.sadd(skey, participant.id)
        # ensure the set itself expires alongside the huddle
        await self._redis.expire(skey, ttl_seconds)

    async def get(self, huddle_id: str, participant_id: str) -> Optional[Participant]:
        raw = await self._redis.get(self._p_key(huddle_id, participant_id))
        if not raw:
            return None
        return Participant.model_validate_json(raw)

    async def list_by_huddle(self, huddle_id: str) -> List[Participant]:
        skey = self._set_key(huddle_id)
        ids = await self._redis.smembers(skey)
        if not ids:
            return []
        participants: List[Participant] = []
        for pid_b in ids:
            pid = pid_b.decode() if isinstance(pid_b, (bytes, bytearray)) else pid_b
            p = await self.get(huddle_id, pid)
            if p:
                participants.append(p)
        return participants

    async def delete(self, huddle_id: str, participant_id: str) -> None:
        await self._redis.delete(self._p_key(huddle_id, participant_id))
        await self._redis.srem(self._set_key(huddle_id), participant_id)


