from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator, TypeVar
from threading import Lock

from app.noodle.config import NoodleSettings, get_noodle_settings
from app.noodle.schemas import NoodlePipelineDocument


T = TypeVar("T")


@dataclass(frozen=True)
class NoodleBatchRecordStats:
    staged_count: int = 0
    committed_count: int = 0
    max_record_seq: int = 0
    max_contiguous_staged_offset: int = 0
    last_committed_version: str | None = None


class NoodlePipelineRepository:
    def __init__(
        self,
        settings: NoodleSettings | None = None,
        storage_path: str | Path = "app/data/noodle_pipelines.db",
        legacy_json_path: str | Path = "app/data/noodle_pipelines.json",
    ) -> None:
        self.settings = settings or get_noodle_settings()
        self.backend = "postgres" if self.settings.database_url.startswith(("postgresql", "postgres")) else "sqlite"
        self.storage_path = self._resolve_sqlite_path(self.settings.database_url, storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.legacy_json_path = Path(legacy_json_path)
        self._lock = Lock()
        self._storage_initialized = False
        self._legacy_migrated = False

    def list_pipelines(self) -> list[NoodlePipelineDocument]:
        self._init_storage()
        payload = self._read_all()
        return [NoodlePipelineDocument.model_validate(item) for item in payload if isinstance(item, dict)]

    def get_pipeline(self, pipeline_id: str) -> NoodlePipelineDocument | None:
        self._init_storage()
        payload = self._read_by_id(pipeline_id)
        if payload is not None:
            return NoodlePipelineDocument.model_validate(payload)
        for pipeline in self.list_pipelines():
            if pipeline.id == pipeline_id:
                return pipeline
        return None

    def save_pipeline(self, document: NoodlePipelineDocument) -> NoodlePipelineDocument:
        self._init_storage()
        with self._lock:
            payload = document.model_dump(mode="json")
            self._upsert(payload)
        return document

    def stage_batch_records(
        self,
        pipeline_id: str,
        batch_session_id: str,
        source_node_id: str,
        source_batch_id: str,
        run_id: str,
        records: list[tuple[int, dict[str, object]]],
    ) -> None:
        if not records:
            return
        self._init_storage()
        staged_at = datetime.now(timezone.utc).isoformat()

        def postgres_stage(connection: Any) -> None:
            payload = [
                (
                    pipeline_id,
                    batch_session_id,
                    source_node_id,
                    source_batch_id,
                    int(record_seq),
                    json.dumps(record_payload, ensure_ascii=True),
                    run_id,
                    staged_at,
                )
                for record_seq, record_payload in records
            ]
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO noodle_batch_staging_records (
                        pipeline_id,
                        batch_session_id,
                        source_node_id,
                        source_batch_id,
                        record_seq,
                        payload_json,
                        staged_run_id,
                        staged_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (batch_session_id, record_seq)
                    DO UPDATE SET
                        payload_json = EXCLUDED.payload_json,
                        staged_run_id = EXCLUDED.staged_run_id,
                        staged_at = EXCLUDED.staged_at
                    """
                    ,
                    payload,
                )

        def sqlite_stage(connection: sqlite3.Connection) -> None:
            connection.executemany(
                """
                INSERT INTO noodle_batch_staging_records (
                    pipeline_id,
                    batch_session_id,
                    source_node_id,
                    source_batch_id,
                    record_seq,
                    payload_json,
                    staged_run_id,
                    staged_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(batch_session_id, record_seq)
                DO UPDATE SET
                    payload_json = excluded.payload_json,
                    staged_run_id = excluded.staged_run_id,
                    staged_at = excluded.staged_at
                """,
                [
                    (
                        pipeline_id,
                        batch_session_id,
                        source_node_id,
                        source_batch_id,
                        int(record_seq),
                        json.dumps(record_payload, ensure_ascii=True),
                        run_id,
                        staged_at,
                    )
                    for record_seq, record_payload in records
                ],
            )

        with self._lock:
            self._run_with_backend(postgres_stage, sqlite_stage)

    def mark_batch_records_committed(
        self,
        batch_session_id: str,
        committed_version: str,
        run_id: str,
    ) -> None:
        self._init_storage()
        committed_at = datetime.now(timezone.utc).isoformat()

        def postgres_commit(connection: Any) -> None:
            connection.execute(
                """
                UPDATE noodle_batch_staging_records
                SET committed_version = %s,
                    committed_run_id = %s,
                    committed_at = %s
                WHERE batch_session_id = %s
                """,
                (committed_version, run_id, committed_at, batch_session_id),
            )

        def sqlite_commit(connection: sqlite3.Connection) -> None:
            connection.execute(
                """
                UPDATE noodle_batch_staging_records
                SET committed_version = ?,
                    committed_run_id = ?,
                    committed_at = ?
                WHERE batch_session_id = ?
                """,
                (committed_version, run_id, committed_at, batch_session_id),
            )

        with self._lock:
            self._run_with_backend(postgres_commit, sqlite_commit)

    def get_batch_record_stats(self, batch_session_id: str) -> NoodleBatchRecordStats:
        self._init_storage()

        def postgres_stats(connection: Any) -> NoodleBatchRecordStats:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT record_seq, committed_version
                    FROM noodle_batch_staging_records
                    WHERE batch_session_id = %s
                    ORDER BY record_seq ASC
                    """,
                    (batch_session_id,),
                )
                rows = cursor.fetchall()
            return self._build_batch_record_stats(rows)

        def sqlite_stats(connection: sqlite3.Connection) -> NoodleBatchRecordStats:
            rows = connection.execute(
                """
                SELECT record_seq, committed_version
                FROM noodle_batch_staging_records
                WHERE batch_session_id = ?
                ORDER BY record_seq ASC
                """,
                (batch_session_id,),
            ).fetchall()
            return self._build_batch_record_stats(rows)

        return self._run_with_backend(postgres_stats, sqlite_stats)

    def _resolve_sqlite_path(self, database_url: str, fallback_path: str | Path) -> Path:
        if database_url.startswith("sqlite:///"):
            return Path(database_url.replace("sqlite:///", "", 1))
        return Path(fallback_path)

    @contextmanager
    def _sqlite_connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.storage_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _run_with_backend(
        self,
        postgres_op: Callable[[Any], T],
        sqlite_op: Callable[[sqlite3.Connection], T],
    ) -> T:
        if self.backend == "postgres":
            try:
                import psycopg  # type: ignore
            except ModuleNotFoundError as exc:
                if not self.settings.allow_sqlite_fallback:
                    raise RuntimeError("psycopg is required for PostgreSQL Noodle persistence.") from exc
            else:
                try:
                    with psycopg.connect(self.settings.database_url) as connection:
                        result = postgres_op(connection)
                        connection.commit()
                        return result
                except Exception as exc:
                    if not self.settings.allow_sqlite_fallback:
                        raise RuntimeError(f"Could not connect to PostgreSQL Noodle persistence: {exc}") from exc

        with self._sqlite_connection() as connection:
            return sqlite_op(connection)

    def _init_storage(self) -> None:
        if self._storage_initialized:
            return

        with self._lock:
            if self._storage_initialized:
                return

            def postgres_init(connection: Any) -> None:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS noodle_pipeline_documents (
                        pipeline_id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        version INTEGER NOT NULL,
                        saved_at TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_noodle_pipeline_saved_at ON noodle_pipeline_documents (saved_at DESC)"
                )
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS noodle_batch_staging_records (
                        pipeline_id TEXT NOT NULL,
                        batch_session_id TEXT NOT NULL,
                        source_node_id TEXT NOT NULL,
                        source_batch_id TEXT NOT NULL,
                        record_seq INTEGER NOT NULL,
                        payload_json TEXT NOT NULL,
                        staged_run_id TEXT NOT NULL,
                        staged_at TEXT NOT NULL,
                        committed_version TEXT,
                        committed_run_id TEXT,
                        committed_at TEXT,
                        PRIMARY KEY (batch_session_id, record_seq)
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_noodle_batch_staging_session ON noodle_batch_staging_records (batch_session_id, record_seq)"
                )

            def sqlite_init(connection: sqlite3.Connection) -> None:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS noodle_pipeline_documents (
                        pipeline_id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        version INTEGER NOT NULL,
                        saved_at TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_noodle_pipeline_saved_at ON noodle_pipeline_documents (saved_at DESC)"
                )
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS noodle_batch_staging_records (
                        pipeline_id TEXT NOT NULL,
                        batch_session_id TEXT NOT NULL,
                        source_node_id TEXT NOT NULL,
                        source_batch_id TEXT NOT NULL,
                        record_seq INTEGER NOT NULL,
                        payload_json TEXT NOT NULL,
                        staged_run_id TEXT NOT NULL,
                        staged_at TEXT NOT NULL,
                        committed_version TEXT,
                        committed_run_id TEXT,
                        committed_at TEXT,
                        PRIMARY KEY (batch_session_id, record_seq)
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_noodle_batch_staging_session ON noodle_batch_staging_records (batch_session_id, record_seq)"
                )

            self._run_with_backend(postgres_init, sqlite_init)
            self._storage_initialized = True

        self._migrate_legacy_json_if_needed()

    def _migrate_legacy_json_if_needed(self) -> None:
        if self._legacy_migrated:
            return

        with self._lock:
            if self._legacy_migrated:
                return
            if not self.legacy_json_path.exists():
                self._legacy_migrated = True
                return
            if self._count_documents() > 0:
                self._legacy_migrated = True
                return

            payload = self._read_legacy_payload()
            for item in payload:
                if isinstance(item, dict):
                    self._upsert(item)
            self._legacy_migrated = True

    def _count_documents(self) -> int:
        def postgres_count(connection: Any) -> int:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM noodle_pipeline_documents")
                row = cursor.fetchone()
                return int(row[0]) if row else 0

        def sqlite_count(connection: sqlite3.Connection) -> int:
            row = connection.execute("SELECT COUNT(*) AS count FROM noodle_pipeline_documents").fetchone()
            return int(row["count"]) if row else 0

        return self._run_with_backend(postgres_count, sqlite_count)

    def _read_all(self) -> list[dict[str, object]]:
        def postgres_read(connection: Any) -> list[dict[str, object]]:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT payload_json
                    FROM noodle_pipeline_documents
                    ORDER BY saved_at DESC, updated_at DESC
                    """
                )
                rows = cursor.fetchall()
            return [json.loads(str(row[0])) for row in rows]

        def sqlite_read(connection: sqlite3.Connection) -> list[dict[str, object]]:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM noodle_pipeline_documents
                ORDER BY saved_at DESC, updated_at DESC
                """
            ).fetchall()
            return [json.loads(str(row["payload_json"])) for row in rows]

        return self._run_with_backend(postgres_read, sqlite_read)

    def _read_by_id(self, pipeline_id: str) -> dict[str, object] | None:
        def postgres_read(connection: Any) -> dict[str, object] | None:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT payload_json
                    FROM noodle_pipeline_documents
                    WHERE pipeline_id = %s
                    """,
                    (pipeline_id,),
                )
                row = cursor.fetchone()
            if not row:
                return None
            return json.loads(str(row[0]))

        def sqlite_read(connection: sqlite3.Connection) -> dict[str, object] | None:
            row = connection.execute(
                """
                SELECT payload_json
                FROM noodle_pipeline_documents
                WHERE pipeline_id = ?
                """,
                (pipeline_id,),
            ).fetchone()
            if not row:
                return None
            return json.loads(str(row["payload_json"]))

        return self._run_with_backend(postgres_read, sqlite_read)

    def _upsert(self, payload: dict[str, object]) -> None:
        pipeline_id = str(payload.get("id", "")).strip()
        if not pipeline_id:
            raise ValueError("Pipeline document id is required.")

        status = str(payload.get("status", "draft"))
        version = int(payload.get("version", 1))
        saved_at = str(payload.get("saved_at") or datetime.now(timezone.utc).isoformat())
        updated_at = datetime.now(timezone.utc).isoformat()
        payload_json = json.dumps(payload, ensure_ascii=True)

        def postgres_upsert(connection: Any) -> None:
            connection.execute(
                """
                INSERT INTO noodle_pipeline_documents (
                    pipeline_id,
                    status,
                    version,
                    saved_at,
                    payload_json,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (pipeline_id)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    version = EXCLUDED.version,
                    saved_at = EXCLUDED.saved_at,
                    payload_json = EXCLUDED.payload_json,
                    updated_at = EXCLUDED.updated_at
                """,
                (pipeline_id, status, version, saved_at, payload_json, updated_at),
            )

        def sqlite_upsert(connection: sqlite3.Connection) -> None:
            connection.execute(
                """
                INSERT INTO noodle_pipeline_documents (
                    pipeline_id,
                    status,
                    version,
                    saved_at,
                    payload_json,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(pipeline_id)
                DO UPDATE SET
                    status = excluded.status,
                    version = excluded.version,
                    saved_at = excluded.saved_at,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (pipeline_id, status, version, saved_at, payload_json, updated_at),
            )

        self._run_with_backend(postgres_upsert, sqlite_upsert)

    def _build_batch_record_stats(self, rows: list[Any]) -> NoodleBatchRecordStats:
        staged_count = len(rows)
        committed_count = 0
        max_record_seq = 0
        max_contiguous = 0
        expected_next = 1
        last_committed_version: str | None = None

        for row in rows:
            record_seq = int(row[0] if not isinstance(row, sqlite3.Row) else row["record_seq"])
            committed_version = row[1] if not isinstance(row, sqlite3.Row) else row["committed_version"]
            max_record_seq = max(max_record_seq, record_seq)
            if record_seq == expected_next:
                max_contiguous = record_seq
                expected_next += 1
            if committed_version:
                committed_count += 1
                last_committed_version = str(committed_version)

        if committed_count == 0:
            committed_count = staged_count

        return NoodleBatchRecordStats(
            staged_count=staged_count,
            committed_count=committed_count,
            max_record_seq=max_record_seq,
            max_contiguous_staged_offset=max_contiguous,
            last_committed_version=last_committed_version,
        )

    def _read_legacy_payload(self) -> list[dict[str, object]]:
        try:
            raw = json.loads(self.legacy_json_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return []
        if not isinstance(raw, list):
            return []
        return [item for item in raw if isinstance(item, dict)]
