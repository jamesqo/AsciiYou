from __future__ import annotations

from typing import AsyncIterator, Dict, Optional
import asyncio
from contextlib import suppress

from fastapi import WebSocket

from persistence.huddle_repository import HuddleRepository
from persistence.participant_repository import ParticipantRepository
from service.participant import Participant


class Huddle:
    """Local representation of huddle session. Mirrors Redis (ground-truth).

    - Maintains in-memory map of Participant objects
    - Keeps membership in sync with Redis via pubsub
    - Provides add/remove helpers and broadcast to connected participants
    """

    def __init__(self,
                 huddle_id: str,
                 huddle_repo: HuddleRepository,
                 participant_repo: ParticipantRepository):
        self.id = huddle_id
        self._huddle_repo = huddle_repo
        self._participant_repo = participant_repo
        self._participants: Dict[str, Participant] = {}
        self._listen_task: Optional[asyncio.Task] = None
        self._tracking = False

    # ---- tracking ----
    async def start_tracking(self) -> None:
        if self._tracking:
            raise ValueError("tracking is already enabled")
        self._listen_task = asyncio.create_task(self._listen())
        self._tracking = True

    async def _listen(self) -> None:
        async for evt in self._participant_repo.member_events(self.id):
            op = evt.get("op")
            pid = evt.get("participant_id")
            if not pid:
                continue
            if op == "add_participant":
                if pid not in self._participants:
                    self.add_local(pid)
            elif op == "remove_participant":
                if pid in self._participants:
                    self.remove_local(pid)
            else:
                raise ValueError(f"unknown member event: {op}")

    async def stop_tracking(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
            with suppress(Exception):
                await self._listen_task
            self._listen_task = None
        self._tracking = False

    # ---- local membership mutations ----

    async def refresh_member_list(self):
        redis_members = set(await self._participant_repo.list_members(self.id))
        local_members = set(self._participants.keys())
        added_members = redis_members - local_members
        dropped_members = local_members - redis_members

        for pid in added_members:
            self.add_local(pid)
        
        for pid in dropped_members:
            self.remove_local(pid)

    def add_local(self,
                  participant_id: str,
                  websocket: Optional[WebSocket] = None) -> None:
        if participant_id in self._participants:
            raise ValueError(f"participant {participant_id} already exists")
        self._participants[participant_id] = Participant(participant_id, self, websocket)

    def remove_local(self, participant_id: str) -> None:
        if participant_id not in self._participants:
            raise ValueError(f"participant {participant_id} not found")
        asyncio.create_task(
            self._participants[participant_id].disconnect()
        )
        del self._participants[participant_id]

    # ---- eventing ----
    async def broadcast_message(self, payload: dict) -> None:
        await self._huddle_repo.publish_room_event(self.id, payload)

    def events(self) -> AsyncIterator[dict[str, str]]:
        return self._huddle_repo.room_events(self.id)
