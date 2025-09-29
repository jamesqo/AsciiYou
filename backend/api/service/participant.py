from __future__ import annotations

from typing import Optional
from fastapi import WebSocket
from pydantic import BaseModel

class Participant:
    """Local representation of participant for a given huddle session.

    Holds the active WebSocket (if any) and provides helpers to send messages.
    A Participant belongs to exactly one Huddle.
    """

    def __init__(self,
                 participant_id: str,
                 huddle: "Huddle",
                 websocket: Optional[WebSocket] = None) -> None:
        self.id = participant_id
        self.huddle = huddle
        self.websocket = websocket
        # should be only used for direct connections (TODO enforce this)
        self.relay_producers = False
    
    @property
    def is_direct_conn(self) -> bool:
        return self.websocket is not None
    
    def set_websocket(self, websocket: WebSocket) -> None:
        self.websocket = websocket

    async def send_message(self, msg: BaseModel) -> None:
        assert self.is_direct_conn, "Participant is connected to a different worker process"
        payload = msg.model_dump(by_alias=True)
        await self.websocket.send_json(payload)
    
    async def disconnect(self):
        await self.websocket.close()
        self.websocket = None


