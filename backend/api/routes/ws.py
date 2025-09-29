from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import jwt
from models.messages import ClientMessage
from service.control import ControlMessageHandler
from service.huddle_verse import HuddleVerse
from settings import settings
from deps import get_huddle_verse_ws
from pydantic import TypeAdapter

router = APIRouter()

@router.websocket("/ws")
async def control_ws(
    websocket: WebSocket,
    huddle_verse: HuddleVerse = Depends(get_huddle_verse_ws),
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
    huddle = huddle_verse.get(huddle_id)
    if not huddle:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    print(f"Accepted control websocket: hid={huddle_id} pid={participant_id}")

    try:
        handler = ControlMessageHandler(
            ws=websocket,
            huddle=huddle,
            pid=participant_id
        )
        async with handler:
            await handler.begin_handshake()
            adapter = TypeAdapter(ClientMessage)
            while True:
                raw = await websocket.receive_json()
                # Validate into a typed union instance
                msg = adapter.validate_python(raw)
                await handler.handle_incoming_message(msg)
    except WebSocketDisconnect:
        print(f"Web socket disconnected: hid={huddle_id} pid={participant_id}")
