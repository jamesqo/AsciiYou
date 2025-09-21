

from fastapi import WebSocket
import httpx
from settings import settings
from models.messages import (
    ClientMessage,
    ControlState,
    ServerHello,
    RouterRtpCapabilities,
    TransportCreated,
    Ack,
    Produced,
    Consumed,
    CreateTransport,
    ConnectTransport,
    Produce as MsgProduce,
    Consume as MsgConsume,
    ProducerOp,
    ConsumerOp,
    Close,
)

class ControlMessageHandler:
    def __init__(self, ws: WebSocket, hid: str, pid: str):
        self.ws = ws
        self.hid = hid
        self.pid = pid
        self.http = httpx.AsyncClient()
        self.state = ControlState.ACCEPTED_WS

    async def __aenter__(self):
        await self.http.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.http.__aexit__(exc_type, exc, tb)

    async def begin_handshake(self) -> None:
        # Send initial hello
        await self.ws.send_json(
            ServerHello(huddle_id=self.hid, participant_id=self.pid).model_dump())
        self.state = ControlState.SENT_HELLO
        
        # Ensure huddle on media server and forward router RTP caps
        caps = await self._sfu_ensure_huddle()
        await self.ws.send_json(RouterRtpCapabilities(data=caps).model_dump())
        self.state = ControlState.WAITING_FOR_TRANSPORT_REQUEST

    # --- SFU HTTP helpers ---
    async def _sfu_ensure_huddle(self) -> dict:
        r = await self.http.post(f"{settings.media_server_url}/huddles/{self.hid}/ensure")
        return r.json()

    async def _sfu_create_transport(self, direction: str | None) -> dict:
        r = await self.http.post(
            f"{settings.media_server_url}/huddles/{self.hid}/transports",
            json={"peerId": self.pid, "direction": direction},
        )
        return r.json()

    async def _sfu_connect_transport(self, transport_id: str, dtls: dict) -> None:
        await self.http.post(
            f"{settings.media_server_url}/transports/{transport_id}/connect",
            json={"hid": self.hid, "peerId": self.pid, "dtlsParameters": dtls},
        )

    async def _sfu_produce(self, transport_id: str, kind: str, rtp_parameters: dict) -> dict:
        r = await self.http.post(
            f"{settings.media_server_url}/huddles/{self.hid}/produce",
            json={"peerId": self.pid, "transportId": transport_id, "kind": kind, "rtpParameters": rtp_parameters},
        )
        return r.json()

    async def _sfu_consume(self, transport_id: str, producer_id: str, rtp_caps: dict) -> dict:
        r = await self.http.post(
            f"{settings.media_server_url}/huddles/{self.hid}/consume",
            json={"peerId": self.pid, "transportId": transport_id, "producerId": producer_id, "rtpCapabilities": rtp_caps},
        )
        return r.json()

    async def _sfu_producer_op(self, op: str, producer_id: str) -> None:
        base = f"{settings.media_server_url}/producers/{producer_id}"
        if op == "pause":
            await self.http.post(f"{base}/pause")
        elif op == "resume":
            await self.http.post(f"{base}/resume")
        elif op == "close":
            await self.http.delete(base)

    async def _sfu_consumer_op(self, op: str, consumer_id: str) -> None:
        base = f"{settings.media_server_url}/consumers/{consumer_id}"
        if op == "pause":
            await self.http.post(f"{base}/pause")
        elif op == "resume":
            await self.http.post(f"{base}/resume")
        elif op == "close":
            await self.http.delete(base)

    # --- Message dispatcher ---
    async def handle_message(self, msg: ClientMessage) -> None:
        match msg:
            case CreateTransport(direction=direction):
                data = await self._sfu_create_transport(direction)
                await self.ws.send_json(TransportCreated(data=data).model_dump())
                self.state = ControlState.WAITING_FOR_TRANSPORT_CONNECT
            case ConnectTransport(transport_id=tid, dtls_parameters=dtls):
                if not tid or not dtls:
                    return
                await self._sfu_connect_transport(tid, dtls)
                await self.ws.send_json(Ack(op="connectTransport", transport_id=tid).model_dump())
                self.state = ControlState.CONNECTED_TO_MEDIA_SERVER
            case MsgProduce(transport_id=tid, kind=kind, rtp_parameters=rtp):
                data = await self._sfu_produce(tid, kind, rtp)
                await self.ws.send_json(Produced(data=data).model_dump())
            case MsgConsume(transport_id=tid, producer_id=pid, rtp_capabilities=caps):
                data = await self._sfu_consume(tid, pid, caps)
                await self.ws.send_json(Consumed(data=data).model_dump())
            case ProducerOp(op=op, producer_id=pid):
                await self._sfu_producer_op(op, pid)
                await self.ws.send_json(Ack(op="producerOp", producer_id=pid).model_dump())
            case ConsumerOp(op=op, consumer_id=cid):
                await self._sfu_consumer_op(op, cid)
                await self.ws.send_json(Ack(op="consumerOp", consumer_id=cid).model_dump())
            case Close():
                raise IOError("WebSocket close requested by client")
