import asyncio
import json
from contextlib import suppress
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
from aiortc.sdp import candidate_from_sdp
import jwt
from backend.persistence.participant_repository import ParticipantRepository
from backend.settings import settings
from backend.deps import get_huddle_repo, get_participant_repo
from backend.persistence.huddle_repository import HuddleRepository

router = APIRouter()

@router.websocket("/sdp")
async def sdp_negotiation(
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
    print(f"Accepted SDP websocket: hud={huddle_id} part={participant_id}")

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

    pc = RTCPeerConnection(
        RTCConfiguration(
            iceServers=[
                RTCIceServer(urls="stun:stun.l.google.com:19302")
            ]
        )
    )
    pc.addTransceiver("video") # recvonly by default

    @pc.on("icecandidate")
    async def on_icecandidate(candidate):
        if candidate is None:
            return

        await websocket.send_json({
            "type": "candidate",
            "candidate": {
                "candidate": candidate.to_sdp(),
                "sdpMLineIndex": candidate.sdpMLineIndex or 0,
            }
        })

    @pc.on("icegatheringstatechange")
    def _(): print("gather:", pc.iceGatheringState)

    @pc.on("iceconnectionstatechange")
    def _(): print("conn:", pc.iceConnectionState)
    
    @pc.on("track")
    def on_track(track):
        if track.kind == "video":
            async def reader():
                while True:
                    _ = await track.recv()  # get next frame
                    # Example: enumerate participant IDs in this huddle from local, up-to-date set
                    print(list(members))
            asyncio.create_task(reader())

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "offer":
                # Handle initial SDP offer from client
                sdp = msg.get("sdp")
                if not sdp:
                    await websocket.close(code=1002)
                    break
                # Update RTCPeerConnection to reflect remote offer
                # Send back an answer using the usual flow
                await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await websocket.send_json({
                    "type": "answer",
                    "sdp": pc.localDescription.sdp,
                })
            elif mtype == "candidate":
                cand = msg.get("candidate") or {}
                sdp_line = cand.get("candidate")
                if sdp_line:
                    c = candidate_from_sdp(sdp_line)
                    c.sdpMLineIndex = cand.get("sdpMLineIndex", 0)
                    print("Adding ICE candidate:", c)
                    await pc.addIceCandidate(c)
            elif mtype == "close":
                break
            else:
                pass
    except WebSocketDisconnect:
        print(f"Web socket disconnected: hud={huddle_id} part={participant_id}")
    finally:
        listener_task.cancel()
        with suppress(Exception):
            await listener_task
        await pc.close()
