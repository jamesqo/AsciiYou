from __future__ import annotations
from fastapi import FastAPI, Request, WebSocket, Depends
from redis.asyncio.client import Redis

from service.huddle_verse import HuddleVerse
from persistence.huddle_repository import HuddleRepository
from persistence.participant_repository import ParticipantRepository

def get_huddle_repo(req: Request) -> HuddleRepository:
    return req.app.state.huddle_repo

def get_participant_repo(req: Request) -> ParticipantRepository:
    return req.app.state.participant_repo

def get_huddle_verse_ws(ws: WebSocket) -> HuddleVerse:
    return ws.app.state.huddle_verse

