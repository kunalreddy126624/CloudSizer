import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.allocator.config import AllocatorSettings


class AllocatorDatabase:
    def __init__(self, settings: AllocatorSettings) -> None:
        self.settings = settings
        self.backend = "postgres" if settings.database_url.startswith("postgresql") else "sqlite"
        self.sqlite_path = self._sqlite_path(settings.database_url)

    def _sqlite_path(self, database_url: str) -> Path:
        if database_url.startswith("sqlite:///"):
            path = database_url.replace("sqlite:///", "", 1)
        else:
            path = "app/data/allocator_agent.db"
        sqlite_path = Path(path)
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        return sqlite_path

    @contextmanager
    def connection(self) -> Iterator[Any]:
        if self.backend == "postgres":
            try:
                import psycopg  # type: ignore
                from psycopg.rows import dict_row  # type: ignore
            except ModuleNotFoundError as exc:
                raise RuntimeError("psycopg is required for PostgreSQL allocator persistence.") from exc

            connection = psycopg.connect(self.settings.database_url, row_factory=dict_row)
            try:
                yield connection
                connection.commit()
            finally:
                connection.close()
            return

        connection = sqlite3.connect(self.sqlite_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def placeholder(self) -> str:
        return "%s" if self.backend == "postgres" else "?"

    def init_storage(self) -> None:
        with self.connection() as connection:
            if self.backend == "postgres":
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS allocator_runs (
                        id SERIAL PRIMARY KEY,
                        requested_by TEXT NOT NULL,
                        change_reason TEXT NOT NULL,
                        status TEXT NOT NULL,
                        approval_status TEXT NOT NULL,
                        budget_validation_status TEXT NOT NULL DEFAULT 'pending',
                        summary TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        account_plan_json TEXT,
                        terraform_bundle_json TEXT,
                        cost_result_json TEXT,
                        policy_result_json TEXT,
                        provisioning_result_json TEXT,
                        workflow_trace_json TEXT NOT NULL DEFAULT '[]',
                        error_message TEXT,
                        reviewed_by TEXT,
                        reviewed_at TEXT,
                        review_comment TEXT,
                        budget_validated_by TEXT,
                        budget_validated_at TEXT,
                        budget_validation_comment TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                self._ensure_postgres_column(
                    connection,
                    "allocator_runs",
                    "budget_validation_status",
                    "TEXT NOT NULL DEFAULT 'pending'",
                )
                self._ensure_postgres_column(connection, "allocator_runs", "budget_validated_by", "TEXT")
                self._ensure_postgres_column(connection, "allocator_runs", "budget_validated_at", "TEXT")
                self._ensure_postgres_column(connection, "allocator_runs", "budget_validation_comment", "TEXT")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS allocator_audit_logs (
                        id SERIAL PRIMARY KEY,
                        run_id INTEGER,
                        actor TEXT NOT NULL,
                        action TEXT NOT NULL,
                        detail_json TEXT NOT NULL DEFAULT '{}',
                        created_at TEXT NOT NULL
                    )
                    """
                )
                return

            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS allocator_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requested_by TEXT NOT NULL,
                    change_reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    approval_status TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    account_plan_json TEXT,
                    terraform_bundle_json TEXT,
                    cost_result_json TEXT,
                    policy_result_json TEXT,
                    provisioning_result_json TEXT,
                    workflow_trace_json TEXT NOT NULL DEFAULT '[]',
                    error_message TEXT,
                    reviewed_by TEXT,
                    reviewed_at TEXT,
                    review_comment TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            self._ensure_sqlite_column(
                connection,
                "allocator_runs",
                "budget_validation_status",
                "TEXT NOT NULL DEFAULT 'pending'",
            )
            self._ensure_sqlite_column(connection, "allocator_runs", "budget_validated_by", "TEXT")
            self._ensure_sqlite_column(connection, "allocator_runs", "budget_validated_at", "TEXT")
            self._ensure_sqlite_column(connection, "allocator_runs", "budget_validation_comment", "TEXT")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS allocator_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    detail_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                )
                """
            )

    def serialize(self, payload: Any) -> str:
        return json.dumps(payload, ensure_ascii=True)

    def _ensure_postgres_column(self, connection: Any, table: str, column: str, definition: str) -> None:
        connection.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
        )

    def _ensure_sqlite_column(self, connection: Any, table: str, column: str, definition: str) -> None:
        rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
        existing = {row[1] for row in rows}
        if column in existing:
            return
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
