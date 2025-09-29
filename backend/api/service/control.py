

import asyncio
from fastapi import WebSocket
import httpx
from service.participant import Participant
from service.huddle import Huddle
from settings import settings
from models.messages import (
    ClientMessage,
    ControlState,
    RelayProducers,
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

    def __init__(self, participant: Participant):
        self.huddle = participant.huddle
        self.part = participant
        self.hid = self.huddle.id
        self.pid = participant.id
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
        await self.part.send_message(RouterRtpCapabilities(data=caps))
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

    async def _sfu_get_state(self) -> dict:
        r = await self.http.get(f"{settings.media_server_url}/huddles/{self.hid}/state")
        return r.json()

    async def send_existing_producers(self) -> None:
        state = await self._sfu_get_state()
        for p in state["participants"]:
            owner = p["id"]
            for prod_id in p["producers"]:
                await self.part.send_message(NewProducer(
                    huddle_id=self.hid,
                    participant_id=owner,
                    producer_id=prod_id,
                ))

    # --- Message dispatcher ---
    async def handle_incoming_message(self, msg: ClientMessage) -> None:
        match msg:
            case CreateTransport(direction=direction):
                data = await self._sfu_create_transport(direction)
                await self.part.send_message(TransportCreated(data=data))
                self.state = ControlState.WAITING_FOR_TRANSPORT_CONNECT
            case ConnectTransport(transport_id=tid, dtls_parameters=dtls):
                if not tid or not dtls:
                    return
                await self._sfu_connect_transport(tid, dtls)
                await self.part.send_message(Ack(op="connectTransport", transport_id=tid))
                self.state = ControlState.CONNECTED_TO_SFU
            case MsgProduce(transport_id=tid, kind=kind, rtp_parameters=rtp):
                data = await self._sfu_produce(tid, kind, rtp)
                await self.part.send_message(Produced(data=data))

                # Broadcast new producer notification to other ControlMessageHandlers
                await self.huddle.broadcast_message({
                    "op": "new_producer",
                    "huddle_id": self.hid,
                    "participant_id": self.pid,
                    # NOTE: the producer ID is NOT the same thing as the participant ID
                    "producer_id": data["id"],
                })
            case RelayProducers():
                # Enable broadcasting of newProducer messages
                # This is local and ephemeral state -- no need to store it in Redis
                self.part.relay_producers = True
                # Send an ACK -- useful in the case where there are no producers to flush
                await self.part.send_message(Ack(op="relayProducers"))

                # Send newProducer messages for all existing participants in the room
                await self.send_existing_producers()
            case MsgConsume(transport_id=tid, producer_id=pid, rtp_capabilities=caps):
                data = await self._sfu_consume(tid, pid, caps)
                await self.part.send_message(Consumed(data=data))
            case ProducerOp(op=op, producer_id=pid):
                await self._sfu_producer_op(op, pid)
                await self.part.send_message(Ack(op="producerOp", producer_id=pid))
            case ConsumerOp(op=op, consumer_id=cid):
                await self._sfu_consumer_op(op, cid)
                await self.part.send_message(Ack(op="consumerOp", consumer_id=cid))
            case Close():
                raise IOError("WebSocket close requested by client")
    
    async def redis_event_loop(self):
        async for evt in self.huddle.events():
            await self.handle_redis_event(evt)
    
    async def handle_redis_event(self, payload: dict):
        op = payload["op"]
        match op:
            case "new_producer":
                assert self.hid == payload["huddle_id"]
                participant_id = payload["participant_id"]
                producer_id = payload["producer_id"]

                # Don't broadcast newProducer from ourselves
                if participant_id != self.pid:
                    # Don't relay new producers until they are explicitly enabled
                    if not self.part.relay_producers:
                        return
                    await self.part.send_message(NewProducer(
                        huddle_id=self.hid,
                        participant_id=participant_id,
                        producer_id=producer_id,
                    ))
            case _:
                raise ValueError(f"unrecognized redis event: {op}")
