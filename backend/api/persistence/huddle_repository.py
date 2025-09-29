from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

from redis.asyncio import Redis

from persistence.pubsub import PubSubMixin
from models.huddle_info  import HuddleInfo


class HuddleRepository(ABC):
    @abstractmethod
    async def create(self, huddle: HuddleInfo, ttl_seconds: int) -> None:
        """Creates a new Huddle."""
        ...

    @abstractmethod
    async def get(self, huddle_id: str) -> Optional[HuddleInfo]:
        """Gets a Huddle from its ID."""
        ...


    @abstractmethod
    async def delete(self, huddle_id: str) -> None:
        """Deletes a Huddle."""
        ...

    @abstractmethod
    async def list_huddles(self) -> list[str]:
        """Returns the list of existing huddle IDs."""
        ...

    @abstractmethod
    def universe_events(self) -> AsyncIterator[dict[str, str]]:
        """Yields events related to all huddles (eg. when a new huddle is created)."""
        ...

    @abstractmethod
    def room_events(self, huddle_id: str) -> AsyncIterator[dict[str, str]]:
        """Yields huddle-scoped events published to the huddle's channel."""
        ...

    @abstractmethod
    async def publish_room_event(self, huddle_id: str, payload: dict) -> None:
        """Publishes a payload to the huddle's event channel."""
        ...


class RedisHuddleRepository(HuddleRepository, PubSubMixin):
    def __init__(self, redis: Redis):
        self._redis = redis

    def _key(self, hid: str) -> str:
        return f"huddles:{hid}"
    
    def _universe_channel(self) -> str:
        return "events:huddles"

    def _room_channel(self, huddle_id: str) -> str:
        return f"events:huddle:{huddle_id}"

    async def create(self, huddle: HuddleInfo, ttl_seconds: int) -> None:
        await self._redis.set(self._key(huddle.id), huddle.model_dump_json(by_alias=True), ex=ttl_seconds, nx=True)
        # publish global huddle add event
        await self._publish(self._universe_channel(), {"op": "add_huddle", "huddle_id": huddle.id})

    async def get(self, huddle_id: str) -> Optional[HuddleInfo]:
        raw = await self._redis.get(self._key(huddle_id))
        if not raw:
            return None
        return HuddleInfo.model_validate_json(raw)

    async def delete(self, huddle_id: str) -> None:
        await self._redis.delete(self._key(huddle_id))
        # publish global huddle remove event
        await self._publish(self._universe_channel(), {"op": "remove_huddle", "huddle_id": huddle_id})

    async def list_huddles(self) -> list[str]:
        ids: list[str] = []
        async for key in self._redis.scan_iter(match="huddles:*"):
            if isinstance(key, (bytes, bytearray)):
                key = key.decode()
            # keys are of the form "huddles:{hid}"
            try:
                _, hid = str(key).split(":", 1)
            except ValueError:
                continue
            ids.append(hid)
        return ids
    
    def universe_events(self) -> AsyncIterator[dict[str, str]]:
        return self._subscribe(self._universe_channel())

    def room_events(self, huddle_id: str) -> AsyncIterator[dict[str, str]]:
        return self._subscribe(self._room_channel(huddle_id))
    
    async def publish_room_event(self, huddle_id: str, payload: dict):
        await self._publish(self._room_channel(huddle_id), payload)
