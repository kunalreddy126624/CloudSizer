import json

from app.db import get_connection
from app.models import EstimateActualCreate, EstimateActualRecord


def create_actual_observation(
    request: EstimateActualCreate,
    user_id: int,
) -> EstimateActualRecord:
    with get_connection() as connection:
        if request.estimate_id is not None:
            owner = connection.execute(
                "SELECT 1 FROM saved_estimates WHERE id = ? AND user_id = ?",
                (request.estimate_id, user_id),
            ).fetchone()
            if owner is None:
                raise KeyError(request.estimate_id)
        cursor = connection.execute(
            """
            INSERT INTO estimate_actuals (
                user_id,
                estimate_id,
                provider,
                workload_type,
                service_code,
                service_name,
                region,
                billing_period_start,
                billing_period_end,
                estimated_monthly_cost_usd,
                actual_monthly_cost_usd,
                notes,
                observed_usage_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                request.estimate_id,
                request.provider.value,
                request.workload_type.value if request.workload_type else None,
                request.service_code,
                request.service_name,
                request.region,
                request.billing_period_start,
                request.billing_period_end,
                request.estimated_monthly_cost_usd,
                request.actual_monthly_cost_usd,
                request.notes,
                json.dumps(request.observed_usage),
            ),
        )
        actual_id = cursor.lastrowid

    return get_actual_observation(actual_id, user_id)


def list_actual_observations(user_id: int) -> list[EstimateActualRecord]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                estimate_id,
                provider,
                workload_type,
                service_code,
                service_name,
                region,
                billing_period_start,
                billing_period_end,
                estimated_monthly_cost_usd,
                actual_monthly_cost_usd,
                notes,
                observed_usage_json,
                created_at
            FROM estimate_actuals
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,),
        ).fetchall()

    return [_row_to_record(row) for row in rows]


def get_actual_observation(actual_id: int, user_id: int) -> EstimateActualRecord:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                estimate_id,
                provider,
                workload_type,
                service_code,
                service_name,
                region,
                billing_period_start,
                billing_period_end,
                estimated_monthly_cost_usd,
                actual_monthly_cost_usd,
                notes,
                observed_usage_json,
                created_at
            FROM estimate_actuals
            WHERE id = ?
              AND user_id = ?
            """,
            (actual_id, user_id),
        ).fetchone()

    if row is None:
        raise KeyError(actual_id)

    return _row_to_record(row)


def _row_to_record(row) -> EstimateActualRecord:
    return EstimateActualRecord.model_validate(
        {
            "id": row["id"],
            "estimate_id": row["estimate_id"],
            "provider": row["provider"],
            "workload_type": row["workload_type"],
            "service_code": row["service_code"],
            "service_name": row["service_name"],
            "region": row["region"],
            "billing_period_start": row["billing_period_start"],
            "billing_period_end": row["billing_period_end"],
            "estimated_monthly_cost_usd": row["estimated_monthly_cost_usd"],
            "actual_monthly_cost_usd": row["actual_monthly_cost_usd"],
            "notes": row["notes"],
            "observed_usage": json.loads(row["observed_usage_json"]),
            "created_at": row["created_at"],
        }
    )
