

import asyncio
from fastapi import WebSocket
import httpx
from service.huddle import Huddle
from settings import settings
from models.messages import (
    ClientMessage,
    ControlState,
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
    NewProducer,
)

class ControlMessageHandler:
    """
    Responsible for:
    (1) two-way communication between client and worker process (via WebSocket)
    (2) interacting with SFU server (sandboxed to backend) in response to WS messages
    (2) event-based communication between this and other workers (via Redis pubsub)
    """

    def __init__(self, ws: WebSocket, huddle: Huddle, pid: str):
        self.ws = ws
        self.huddle = huddle
        self.hid = huddle.id
        self.pid = pid
        # TODO: use DI for this?
        self.http = httpx.AsyncClient()
        self.state = ControlState.ACCEPTED_WS

        # pick up on events from other worker processes
        asyncio.create_task(self.redis_event_loop())

    async def __aenter__(self):
        await self.http.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.http.__aexit__(exc_type, exc, tb)

    async def begin_handshake(self) -> None:
        # Ensure huddle on media server and forward router RTP caps
        caps = await self._sfu_ensure_huddle()
        await self.ws.send_json(RouterRtpCapabilities(data=caps).dump())
        self.state = ControlState.WAITING_FOR_TRANSPORT_REQUEST

    # --- SFU HTTP helpers ---
    async def _sfu_ensure_huddle(self) -> dict:
        r = await self.http.post(f"{settings.media_server_url}/huddles/{self.hid}/ensure")
        return r.json()

    async def _sfu_create_transport(self, direction: str | None) -> dict:
        r = await self.http.post(
            f"{settings.media_server_url}/huddles/{self.hid}/transports",
            json={"participantId": self.pid, "direction": direction},
        )
        return r.json()

    async def _sfu_connect_transport(self, transport_id: str, dtls: dict) -> None:
        await self.http.post(
            f"{settings.media_server_url}/transports/{transport_id}/connect",
            json={"hid": self.hid, "participantId": self.pid, "dtlsParameters": dtls},
        )

    async def _sfu_produce(self, transport_id: str, kind: str, rtp_parameters: dict) -> dict:
        r = await self.http.post(
            f"{settings.media_server_url}/huddles/{self.hid}/produce",
            json={"participantId": self.pid, "transportId": transport_id, "kind": kind, "rtpParameters": rtp_parameters},
        )
        return r.json()

    async def _sfu_consume(self, transport_id: str, producer_id: str, rtp_caps: dict) -> dict:
        r = await self.http.post(
            f"{settings.media_server_url}/huddles/{self.hid}/consume",
            json={"participantId": self.pid, "transportId": transport_id, "producerId": producer_id, "rtpCapabilities": rtp_caps},
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
    async def handle_incoming_message(self, msg: ClientMessage) -> None:
        match msg:
            case CreateTransport(direction=direction):
                data = await self._sfu_create_transport(direction)
                await self.ws.send_json(TransportCreated(data=data).dump())
                self.state = ControlState.WAITING_FOR_TRANSPORT_CONNECT
            case ConnectTransport(transport_id=tid, dtls_parameters=dtls):
                if not tid or not dtls:
                    return
                await self._sfu_connect_transport(tid, dtls)
                await self.ws.send_json(Ack(op="connectTransport", transport_id=tid).dump())
                self.state = ControlState.CONNECTED_TO_SFU
            case MsgProduce(transport_id=tid, kind=kind, rtp_parameters=rtp):
                data = await self._sfu_produce(tid, kind, rtp)
                await self.ws.send_json(Produced(data=data).dump())

                # Broadcast new producer notification to other ControlMessageHandlers
                await self.huddle.broadcast_message({
                    "op": "new_producer",
                    "huddle_id": self.hid,
                    # NOTE: the producer ID is NOT the same thing as the participant ID
                    "producer_id": data["id"],
                })
            case MsgConsume(transport_id=tid, producer_id=pid, rtp_capabilities=caps):
                data = await self._sfu_consume(tid, pid, caps)
                await self.ws.send_json(Consumed(data=data).dump())
            case ProducerOp(op=op, producer_id=pid):
                await self._sfu_producer_op(op, pid)
                await self.ws.send_json(Ack(op="producerOp", producer_id=pid).dump())
            case ConsumerOp(op=op, consumer_id=cid):
                await self._sfu_consumer_op(op, cid)
                await self.ws.send_json(Ack(op="consumerOp", consumer_id=cid).dump())
            case Close():
                raise IOError("WebSocket close requested by client")
    
    async def redis_event_loop(self):
        async for evt in self.huddle.events():
            await self.handle_redis_event(evt)
    
    async def handle_redis_event(self, payload: dict):
        op = payload["op"]
        match op:
            case "new_producer":
                producer_id = payload["producer_id"]
                if producer_id != self.pid:
                    await self.ws.send_json(NewProducer(
                        huddle_id=self.hid,
                        producer_id=producer_id,
                    ).dump())
            case _:
                raise ValueError(f"unrecognized redis event: {op}")
