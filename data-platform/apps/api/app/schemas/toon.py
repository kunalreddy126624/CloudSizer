from __future__ import annotations

from typing import Any

from pydantic import Field

from app.schemas.common import APIModel


class ToonEncodeRequest(APIModel):
    value: Any


class ToonEncodeResponse(APIModel):
    toon: str = Field(..., examples=["TOON1\n\to\t\n/name\ts\t\"demo\""])


class ToonDecodeRequest(APIModel):
    toon: str


class ToonDecodeResponse(APIModel):
    value: Any
