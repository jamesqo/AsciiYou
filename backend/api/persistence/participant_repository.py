from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, AsyncIterator
import json

from redis.asyncio import Redis

from persistence.pubsub import PubSubMixin
from models.participant_info import ParticipantInfo


class ParticipantRepository(ABC):
    @abstractmethod
    async def add(self, huddle_id: str, participant: ParticipantInfo) -> None:
        """Create a new Participant and add them to the Huddle's participant list."""
        ...

    @abstractmethod
    async def get(self, participant_id: str) -> Optional[ParticipantInfo]:
        """Gets a Participant from their ID."""
        ...

    @abstractmethod
    async def delete(self, huddle_id: str, participant_id: str) -> None:
        """Deletes a Participant and removes them from the Huddle's participant list."""
        ...

    @abstractmethod
    async def list_members(self, huddle_id: str) -> list[str]:
        """Gets the list of participant IDs in a Huddle."""
        ...

    # TODO: consider making the events strongly-typed
    @abstractmethod
    def member_events(self, huddle_id: str) -> AsyncIterator[dict[str, str]]:
        """Yields membership updates (op: add/remove, participant_id)."""
        ...


class RedisParticipantRepository(ParticipantRepository, PubSubMixin):
    def __init__(self, redis: Redis):
        self._redis = redis

    def _p_key(self, participant_id: str) -> str:
        return f"participant:{participant_id}"

    def _set_key(self, huddle_id: str) -> str:
        return f"huddle:{huddle_id}:members"

    def _h_key(self, huddle_id: str) -> str:
        # Mirror RedisHuddleRepository._key
        return f"huddles:{huddle_id}"

    def _channel(self, huddle_id: str) -> str:
        return f"events:huddle:{huddle_id}:members"

    async def add(self, huddle_id: str, participant: ParticipantInfo) -> None:
        # Align participant TTL to the huddle's TTL
        # NOTE: may need to revisit this approach in the future
        # if we decide to support extending Huddle TTLs
        hkey = self._h_key(huddle_id)
        ttl_ms = await self._redis.pttl(hkey)
        if ttl_ms == -2:
            # huddle missing/expired
            raise ValueError("Huddle not found or expired")

        pkey = self._p_key(participant.id)
        skey = self._set_key(huddle_id)
        # store participant fields in a hash and index id in the huddle's participant set
        data: Dict[str, Any] = participant.model_dump(by_alias=True)
        # ensure 'id' is present in hash for completeness
        data.setdefault('id', participant.id)
        if data:
            await self._redis.hset(pkey, mapping=data)
        await self._redis.sadd(skey, participant.id)

        # ensure the participant and set expire with the huddle
        if ttl_ms > 0:
            await self._redis.pexpire(pkey, ttl_ms)
            await self._redis.pexpire(skey, ttl_ms)
        else:
            # ttl == -1 means no expiration on huddle; keep participant keys persistent too
            await self._redis.persist(pkey)
            await self._redis.persist(skey)

        # publish membership update
        await self._redis.publish(self._channel(huddle_id), json.dumps({
            "op": "add_participant",
            "huddle_id": huddle_id,
            "participant_id": participant.id,
        }))

    async def get(self, participant_id: str) -> Optional[ParticipantInfo]:
        data = await self._redis.hgetall(self._p_key(participant_id))
        if not data:
            return None
        # redis returns bytes; decode to str if needed
        decoded = { (k.decode() if isinstance(k, (bytes, bytearray)) else k): (v.decode() if isinstance(v, (bytes, bytearray)) else v) for k, v in data.items() }
        return ParticipantInfo.model_validate(decoded)

    async def delete(self, huddle_id: str, participant_id: str) -> None:
        await self._redis.delete(self._p_key(participant_id))
        await self._redis.srem(self._set_key(huddle_id), participant_id)
        # publish membership update
        await self._redis.publish(self._channel(huddle_id), json.dumps({
            "op": "remove_participant",
            "huddle_id": huddle_id,
            "participant_id": participant_id,
        }))

    async def list_members(self, huddle_id: str) -> list[str]:
        members = await self._redis.smembers(self._set_key(huddle_id))
        return [m.decode() if isinstance(m, (bytes, bytearray)) else str(m) for m in members]

    def member_events(self, huddle_id: str) -> AsyncIterator[dict[str, str]]:
        return self._subscribe(self._channel(huddle_id))
