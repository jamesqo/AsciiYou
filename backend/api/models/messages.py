from __future__ import annotations

from enum import Enum
from typing import Any, Annotated, Literal, Union

from pydantic import Field

from models.camel_case import CamelCase

class ControlState(Enum):
    ACCEPTED_WS = 0
    WAITING_FOR_TRANSPORT_REQUEST = 1
    WAITING_FOR_TRANSPORT_CONNECT = 2
    CONNECTED_TO_SFU = 3

# ===== Client -> Server messages =====


class CreateTransport(CamelCase):
    type: Literal["createTransport"]
    direction: Literal["send", "recv"] | None = None


class ConnectTransport(CamelCase):
    type: Literal["connectTransport"]
    transport_id: str
    dtls_parameters: dict[str, Any]


class Produce(CamelCase):
    type: Literal["produce"]
    transport_id: str
    kind: Literal["audio", "video"]
    rtp_parameters: dict[str, Any]

class RelayProducers(CamelCase):
    type: Literal["relayProducers"]

class Consume(CamelCase):
    type: Literal["consume"]
    transport_id: str
    producer_id: str
    rtp_capabilities: dict[str, Any]


class ProducerOp(CamelCase):
    type: Literal["producerOp"]
    op: Literal["pause", "resume", "close"]
    producer_id: str


class ConsumerOp(CamelCase):
    type: Literal["consumerOp"]
    op: Literal["pause", "resume", "close"]
    consumer_id: str


class Close(CamelCase):
    type: Literal["close"]


ClientMessage = Annotated[
    Union[
        CreateTransport,
        ConnectTransport,
        Produce,
        RelayProducers,
        Consume,
        ProducerOp,
        ConsumerOp,
        Close,
    ],
    Field(discriminator="type"),
]


# ===== Server -> Client messages =====


class RouterRtpCapabilities(CamelCase):
    type: Literal["routerRtpCapabilities"] = "routerRtpCapabilities"
    data: dict[str, Any]


class TransportCreated(CamelCase):
    type: Literal["transportCreated"] = "transportCreated"
    data: dict[str, Any]


class Ack(CamelCase):
    type: Literal["ack"] = "ack"
    op: str
    transport_id: str | None = None
    producer_id: str | None = None
    consumer_id: str | None = None


class Produced(CamelCase):
    type: Literal["produced"] = "produced"
    data: dict[str, Any]


class Consumed(CamelCase):
    type: Literal["consumed"] = "consumed"
    data: dict[str, Any]


# Event: a new producer has been created by a participant in the huddle
class NewProducer(CamelCase):
    type: Literal["newProducer"] = "newProducer"
    huddle_id: str
    participant_id: str
    producer_id: str


# Discriminated union for server -> client
ServerMessage = Annotated[
    Union[
        RouterRtpCapabilities,
        TransportCreated,
        Ack,
        Produced,
        Consumed,
        NewProducer,
    ],
    Field(discriminator="type"),
]


