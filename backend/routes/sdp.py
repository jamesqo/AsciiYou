from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.sdp import candidate_from_sdp
import jwt
from backend.config import JWT_SECRET

router = APIRouter()


@router.websocket("/sdp")
async def sdp_negotiation(websocket: WebSocket):
    # Validate token and extract claims
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        await websocket.close(code=1008)
        return
    huddle_id = claims.get("hid")
    participant_id = claims.get("pid")

    await websocket.accept()
    print(f"Accepted SDP websocket: hud={huddle_id} part={participant_id}")

    pc = RTCPeerConnection()

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
                    await pc.addIceCandidate(c)
            elif mtype == "close":
                break
            else:
                pass
    except WebSocketDisconnect:
        print(f"Web socket disconnected: hud={huddle_id} part={participant_id}")
    finally:
        await pc.close()
