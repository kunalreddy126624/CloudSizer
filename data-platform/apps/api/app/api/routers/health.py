from fastapi import APIRouter

from app.schemas.common import MessageResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=MessageResponse)
def healthcheck() -> MessageResponse:
    return MessageResponse(message="ok")
