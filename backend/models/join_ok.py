from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, AnyUrl, ConfigDict
from pydantic.alias_generators import to_camel


class JoinOk(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    ok: bool
    huddle_id: str
    participant_id: str
    role: Literal["host", "guest"]
    huddle_expiry: str
    sdp_token: str


