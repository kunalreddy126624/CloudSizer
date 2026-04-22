from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.toon import ToonDecodeRequest, ToonDecodeResponse, ToonEncodeRequest, ToonEncodeResponse
from app.services.toon import from_toon, to_toon

router = APIRouter(prefix="/toon", tags=["toon"])


@router.post("/encode", response_model=ToonEncodeResponse)
def encode_toon(payload: ToonEncodeRequest) -> ToonEncodeResponse:
    try:
        return ToonEncodeResponse(toon=to_toon(payload.value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/decode", response_model=ToonDecodeResponse)
def decode_toon(payload: ToonDecodeRequest) -> ToonDecodeResponse:
    try:
        return ToonDecodeResponse(value=from_toon(payload.toon))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
