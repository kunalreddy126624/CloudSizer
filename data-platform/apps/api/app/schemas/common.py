from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class APIModel(BaseModel):
    model_config = {"from_attributes": True}


class TimestampedModel(APIModel):
    created_at: datetime
    updated_at: datetime


class MessageResponse(APIModel):
    message: str = Field(..., examples=["ok"])
