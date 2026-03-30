import json

from app.db import get_connection
from app.models import SavedEstimateCreate, SavedEstimateRecord


def create_saved_estimate(
    request: SavedEstimateCreate,
    user_id: int,
) -> SavedEstimateRecord:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO saved_estimates (
                user_id,
                name,
                estimate_type,
                provider,
                estimated_monthly_cost_usd,
                summary,
                payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                request.name,
                request.estimate_type.value,
                request.provider.value if request.provider else None,
                request.estimated_monthly_cost_usd,
                request.summary,
                json.dumps(request.payload),
            ),
        )
        estimate_id = cursor.lastrowid

    return get_saved_estimate(estimate_id, user_id)


def list_saved_estimates(user_id: int) -> list[SavedEstimateRecord]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                name,
                estimate_type,
                provider,
                estimated_monthly_cost_usd,
                summary,
                payload_json,
                created_at
            FROM saved_estimates
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,),
        ).fetchall()

    return [_row_to_record(row) for row in rows]


def get_saved_estimate(estimate_id: int, user_id: int) -> SavedEstimateRecord:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                name,
                estimate_type,
                provider,
                estimated_monthly_cost_usd,
                summary,
                payload_json,
                created_at
            FROM saved_estimates
            WHERE id = ?
              AND user_id = ?
            """,
            (estimate_id, user_id),
        ).fetchone()

    if row is None:
        raise KeyError(estimate_id)

    return _row_to_record(row)


def delete_saved_estimate(estimate_id: int, user_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM saved_estimates WHERE id = ? AND user_id = ?",
            (estimate_id, user_id),
        )
        return cursor.rowcount > 0


def _row_to_record(row) -> SavedEstimateRecord:
    payload = json.loads(row["payload_json"])
    return SavedEstimateRecord.model_validate(
        {
            "id": row["id"],
            "name": row["name"],
            "estimate_type": row["estimate_type"],
            "provider": row["provider"],
            "estimated_monthly_cost_usd": row["estimated_monthly_cost_usd"],
            "summary": row["summary"],
            "payload": payload,
            "created_at": row["created_at"],
        }
    )
