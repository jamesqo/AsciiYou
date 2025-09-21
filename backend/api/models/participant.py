from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from models.camel_case import CamelCase


class Participant(CamelCase):
    id: str
    role: Literal["host", "guest"]


