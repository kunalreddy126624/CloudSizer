from typing import Any

from app.allocator.repository import AllocatorRepository
from app.allocator.schemas import AuditLogRecord


class AuditService:
    def __init__(self, repository: AllocatorRepository) -> None:
        self.repository = repository

    def record(
        self,
        *,
        actor: str,
        action: str,
        run_id: int | None = None,
        detail: dict[str, Any] | None = None,
    ) -> AuditLogRecord:
        return self.repository.add_audit_log(
            run_id=run_id,
            actor=actor,
            action=action,
            detail=detail,
        )
