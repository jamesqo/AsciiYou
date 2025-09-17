from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json


router = APIRouter()

rooms: Dict[str, Set[WebSocket]] = {}


@router.websocket("/huddles/{huddle_id}/handshake")
async def sdp_handshake(websocket: WebSocket, huddle_id: str):
    

