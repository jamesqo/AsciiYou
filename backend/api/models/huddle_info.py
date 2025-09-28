from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from models.camel_case import CamelCase

class HuddleInfo(CamelCase):
    id: str
    created_at: datetime
    expires_at: datetime

