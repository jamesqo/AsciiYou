import json
from typing import AsyncIterator

class PubSubMixin:
    """
    Shared mixin code for repository classes using Redis pub/sub.
    """

    async def _publish(self, channel: str, payload: dict):
        payload_json = json.dumps(payload)
        print(f"pub {channel} {payload_json}")
        await self._redis.publish(channel, payload_json)

    async def _subscribe(self, channel: str) -> AsyncIterator[dict[str, str]]:
        print("subscribing to channel:", channel)
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if not message or message.get("type") != "message":
                    continue
                data = message.get("data")
                if isinstance(data, (bytes, bytearray)):
                    data = data.decode()
                print(f"recv {channel} {data}")
                evt = json.loads(data)
                yield evt
        finally:
            try:
                await pubsub.unsubscribe(channel)
            finally:
                await pubsub.close()
