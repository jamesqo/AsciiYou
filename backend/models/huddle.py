from __future__ import annotations

from datetime import datetime
from typing import Dict

from pydantic import BaseModel, AnyUrl, ConfigDict, Field
from pydantic.alias_generators import to_camel

from backend.models.participant import Participant


class Huddle(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    id: str
    created_at: datetime
    expires_at: datetime
    participants: Dict[str, Participant] = Field(default_factory=dict)

