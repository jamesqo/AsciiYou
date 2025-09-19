from __future__ import annotations

from datetime import datetime
from typing import Dict, Literal

from pydantic import BaseModel, AnyUrl, ConfigDict, Field
from pydantic.alias_generators import to_camel

class Participant(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    id: str
    role: Literal["host", "guest"]


class Huddle(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    id: str
    created_at: datetime
    expires_at: datetime
    participants: Dict[str, Participant] = Field(default_factory=dict)
    sdp_ws_base: AnyUrl


class JoinOk(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    ok: bool
    huddle_id: str
    participant_id: str
    role: Literal["host", "guest"]
    huddle_expiry: str
    sdp_negotiation_url: AnyUrl


# class SDPMessage(BaseModel):
#     type: Literal["offer", "answer"]
#     sdp: str
