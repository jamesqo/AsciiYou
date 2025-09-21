import asyncio
from contextlib import suppress
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import jwt
from models.messages import ClientMessage
from service.control import ControlMessageHandler
from persistence.participant_repository import ParticipantRepository
from settings import settings
from deps import get_huddle_repo, get_participant_repo
from pydantic import TypeAdapter
from persistence.huddle_repository import HuddleRepository

router = APIRouter()

@router.websocket("/ws")
async def control_ws(
    websocket: WebSocket,
    huddle_repo: HuddleRepository = Depends(get_huddle_repo),
    participant_repo: ParticipantRepository = Depends(get_participant_repo),
):
    # Validate token and extract claims
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        await websocket.close(code=1008)
        return
    huddle_id = claims.get("hid")
    participant_id = claims.get("pid")
    # Validate huddle exists
    h = await huddle_repo.get(huddle_id)
    if not h:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    print(f"Accepted control websocket: hid={huddle_id} pid={participant_id}")

    # Maintain local membership set via repository events
    # TODO: perhaps this should be its own class in the service layer?
    # something like LocalMembershipCache?
    members = set(await participant_repo.list_members(huddle_id))

    async def membership_listener():
        async for evt in participant_repo.member_events(huddle_id):
            op = evt.get("op")
            pid = evt.get("participant_id")
            if op == "add" and pid:
                members.add(pid)
            elif op == "remove" and pid:
                members.discard(pid)

    listener_task = asyncio.create_task(membership_listener())

    try:
        handler = ControlMessageHandler(
            ws=websocket,
            hid=huddle_id,
            pid=participant_id
        )
        async with handler:
            await handler.begin_handshake()
            adapter = TypeAdapter(ClientMessage)
            while True:
                raw = await websocket.receive_json()
                # Validate into a typed union instance
                msg = adapter.validate_python(raw)
                await handler.handle_message(msg)
    except WebSocketDisconnect:
        print(f"Web socket disconnected: hid={huddle_id} pid={participant_id}")
    finally:
        listener_task.cancel()
        with suppress(Exception):
            await listener_task
