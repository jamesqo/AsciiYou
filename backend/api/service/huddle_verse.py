from __future__ import annotations

from typing import Dict, Optional
import asyncio
from contextlib import suppress

from persistence.participant_repository import ParticipantRepository
from service.huddle import Huddle
from persistence.huddle_repository import HuddleRepository


class HuddleVerse:
    """Tracks the "universe" of Huddle instances and keeps them in sync with Redis via huddle_events.

    - Creates/destroys local Huddle objects on add_huddle/remove_huddle events
    - Each Huddle is responsible for syncing its participant list via pubsub
    """

    def __init__(self, huddle_repo: HuddleRepository, participant_repo: ParticipantRepository):
        self._huddle_repo = huddle_repo
        self._participant_repo = participant_repo
        self._huddles: Dict[str, Huddle] = {}
        self._listen_task: Optional[asyncio.Task] = None
        self._tracking = False

    # --- lifecycle ---
    async def start_tracking(self) -> None:
        if self._tracking:
            return
        self._listen_task = asyncio.create_task(self._listen())
        self._tracking = True

    async def stop_tracking(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
            with suppress(Exception):
                await self._listen_task
            self._listen_task = None
        self._tracking = False

    async def _listen(self) -> None:
        async for evt in self._huddle_repo.universe_events():
            op = evt.get("op")
            hid = evt.get("huddle_id")
            if not hid:
                continue
            if op == "add_huddle":
                # Create local representation if missing
                if hid not in self._huddles:
                    self._huddles[hid] = Huddle(hid, self._huddle_repo, self._participant_repo)
            elif op == "remove_huddle":
                h = self._huddles.pop(hid, None)
                if h:
                    await h.stop_tracking()
            else:
                raise ValueError(f"unrecognized event: {op}")

    # --- manual sync helpers ---
    async def refresh_huddle_list(self) -> None:
        """Reconcile local huddles with Redis global state (via list_huddles)."""
        redis_ids = set(await self._huddle_repo.list_huddles())
        local_ids = set(self._huddles.keys())
        added = redis_ids - local_ids
        dropped = local_ids - redis_ids

        for hid in added:
            self._huddles[hid] = Huddle(hid, self._huddle_repo, self._participant_repo)
        for hid in dropped:
            h = self._huddles.pop(hid, None)
            if h:
                await h.stop_tracking()

    async def add_local(self, huddle_id: str) -> None:
        """Create a local Huddle representation without mutating Redis."""
        if huddle_id in self._huddles:
            raise ValueError(f"huddle {huddle_id} already exists")
        self._huddles[huddle_id] = Huddle(huddle_id, self._huddle_repo, self._participant_repo)

    async def remove_local(self, huddle_id: str) -> None:
        """Remove a local Huddle representation without mutating Redis."""
        if huddle_id not in self._huddles:
            raise ValueError("huddle not found")
        h = self._huddles.pop(huddle_id)
        await h.stop_tracking()

    # --- API ---
    def get(self, huddle_id: str) -> Optional[Huddle]:
        return self._huddles.get(huddle_id)
