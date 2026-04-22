import tempfile
import unittest
import importlib
import json
from pathlib import Path
from unittest.mock import patch

from app.noodle.config import NoodleSettings
from app.noodle.connectors.adapters import (
    AzureSqlConnectorAdapter,
    AzureBlobConnectorAdapter,
    GcsConnectorAdapter,
    GenericDatabaseConnectorAdapter,
    GitHubConnectorAdapter,
    GenericFileConnectorAdapter,
    NoodleConnectorAdapterContext,
    NoodleConnectorAdapterRegistry,
    OracleConnectorAdapter,
    PostgresConnectorAdapter,
    S3ConnectorAdapter,
    SnowflakeSourceConnectorAdapter,
    SqlServerConnectorAdapter,
)
from app.noodle.connectors.sink_adapters import NoodleSinkAdapterRegistry, SnowflakeSinkAdapter
from app.noodle.pipeline_service import NoodlePipelineControlPlaneService
from app.noodle.repository import NoodlePipelineRepository
from app.noodle.runtime import NoodlePipelineRuntimeService
from app.noodle.schemas import (
    NoodleDesignerConnectionRef,
    NoodleDesignerNode,
    NoodlePipelineDocument,
    NoodlePipelineRunCreateRequest,
)

REAL_IMPORT_MODULE = importlib.import_module


def _build_test_document() -> NoodlePipelineDocument:
    return NoodlePipelineDocument.model_validate(
        {
            "id": "pipeline-test",
            "name": "pipeline-test",
            "status": "published",
            "version": 3,
            "saved_at": "2026-01-01T00:00:00+00:00",
            "nodes": [
                {
                    "id": "node-source",
                    "label": "Source",
                    "kind": "source",
                    "position": {"x": 0, "y": 0},
                    "params": [],
                },
                {
                    "id": "node-transform",
                    "label": "Transform",
                    "kind": "transform",
                    "position": {"x": 100, "y": 0},
                    "params": [],
                },
                {
                    "id": "node-cache",
                    "label": "Cache",
                    "kind": "cache",
                    "position": {"x": 200, "y": 0},
                    "params": [
                        {"key": "max_capture_mb", "value": "30"},
                        {"key": "preview_kb", "value": "128"},
                        {"key": "format", "value": "jsonl"},
                    ],
                },
            ],
            "edges": [
                {"id": "edge-1", "source": "node-source", "target": "node-transform"},
                {"id": "edge-2", "source": "node-transform", "target": "node-cache"},
            ],
            "connection_refs": [],
            "metadata_assets": [],
            "schemas": [],
            "transformations": [
                {
                    "id": "tx-1",
                    "node_id": "node-transform",
                    "name": "Normalize value",
                    "plugin": "transform-plugin",
                    "mode": "python",
                    "description": "",
                    "code": "value = value",
                    "config_json": "{}",
                    "tags": [],
                }
            ],
            "orchestrator_plan": {
                "id": "plan-1",
                "name": "plan-1",
                "objective": "test",
                "trigger": "manual",
                "execution_target": "apache-airflow",
                "tasks": [
                    {
                        "id": "task-1",
                        "node_id": "node-source",
                        "name": "Ingest source",
                        "stage": "ingest",
                        "plugin": "source-plugin",
                        "execution_plane": "airflow",
                        "depends_on": [],
                        "outputs": [],
                        "notes": "",
                    },
                    {
                        "id": "task-2",
                        "node_id": "node-transform",
                        "name": "Apply transforms",
                        "stage": "transform",
                        "plugin": "transform-plugin",
                        "execution_plane": "worker",
                        "depends_on": ["task-1"],
                        "outputs": [],
                        "notes": "",
                    },
                    {
                        "id": "task-3",
                        "node_id": "node-cache",
                        "name": "Buffer preview",
                        "stage": "cache-observer",
                        "plugin": "cache-observer-plugin",
                        "execution_plane": "worker",
                        "depends_on": ["task-2"],
                        "outputs": ["cached-preview"],
                        "notes": "",
                    },
                ],
                "notes": [],
            },
            "schedule": {
                "trigger": "manual",
                "cron": "0 * * * *",
                "timezone": "UTC",
                "enabled": True,
                "concurrency_policy": "forbid",
                "orchestration_mode": "tasks",
                "if_condition": "",
            },
            "runs": [],
        }
    )


def _build_runtime_document(
    source_auth_ref: Path | str,
    dump_path: Path | None,
    connection_plugin: str = "file-plugin",
    connection_id: str = "conn-orders",
    connection_name: str = "orders-file",
    source_label: str = "Orders Source",
    source_params: list[dict[str, str]] | None = None,
    connection_ref_params: list[dict[str, str]] | None = None,
    dump_params: list[dict[str, str]] | None = None,
    extra_connections: list[dict[str, object]] | None = None,
    dump_kind: str = "cache",
) -> NoodlePipelineDocument:
    source_param_values = list(source_params or [])
    if not any(param["key"].strip().lower() == "connection_ref" for param in source_param_values):
        source_param_values.insert(0, {"key": "connection_ref", "value": connection_id})
    if not any(param["key"].strip().lower() == "format" for param in source_param_values):
        source_param_values.append({"key": "format", "value": "jsonl"})

    dump_param_values = list(dump_params or [])
    if dump_path is not None and not any(param["key"].strip().lower() == "dump_path" for param in dump_param_values):
        dump_param_values.insert(0, {"key": "dump_path", "value": dump_path.as_posix()})
    if not any(param["key"].strip().lower() == "format" for param in dump_param_values):
        dump_param_values.append({"key": "format", "value": "jsonl"})
    if not any(param["key"].strip().lower() == "preview_kb" for param in dump_param_values):
        dump_param_values.append({"key": "preview_kb", "value": "64"})

    connection_refs = [
        {
            "id": connection_id,
            "name": connection_name,
            "plugin": connection_plugin,
            "environment": "test",
            "auth_ref": source_auth_ref.as_posix() if isinstance(source_auth_ref, Path) else str(source_auth_ref),
            "params": list(connection_ref_params or []),
            "notes": "Integration test source connection.",
        }
    ]
    if extra_connections:
        connection_refs.extend(extra_connections)

    return NoodlePipelineDocument.model_validate(
        {
            "id": "pipeline-runtime",
            "name": "pipeline-runtime",
            "status": "published",
            "version": 1,
            "saved_at": "2026-01-01T00:00:00+00:00",
            "nodes": [
                {
                    "id": "node-source",
                    "label": source_label,
                    "kind": "source",
                    "position": {"x": 0, "y": 0},
                    "params": source_param_values,
                },
                {
                    "id": "node-transform",
                    "label": "Normalize Orders",
                    "kind": "transform",
                    "position": {"x": 100, "y": 0},
                    "params": [],
                },
                {
                    "id": "node-cache",
                    "label": "Dump Orders" if dump_kind == "cache" else "Sink Orders",
                    "kind": dump_kind,
                    "position": {"x": 200, "y": 0},
                    "params": dump_param_values,
                },
            ],
            "edges": [
                {"id": "edge-1", "source": "node-source", "target": "node-transform"},
                {"id": "edge-2", "source": "node-transform", "target": "node-cache"},
            ],
            "connection_refs": connection_refs,
            "metadata_assets": [],
            "schemas": [],
            "transformations": [
                {
                    "id": "tx-runtime",
                    "node_id": "node-transform",
                    "name": "Normalize order payload",
                    "plugin": "transform-plugin",
                    "mode": "python",
                    "description": "",
                    "code": "record = record",
                    "config_json": "{}",
                    "tags": [],
                }
            ],
            "orchestrator_plan": None,
            "schedule": {
                "trigger": "manual",
                "cron": "",
                "timezone": "UTC",
                "enabled": True,
                "concurrency_policy": "forbid",
                "orchestration_mode": "tasks",
                "if_condition": "",
            },
            "runs": [],
        }
    )


class _FakePsycopgCursor:
    def __init__(self, rows: list[dict[str, object]], capture: dict[str, object]) -> None:
        self._rows = rows
        self._capture = capture
        self.description = [(key,) for key in rows[0].keys()] if rows else []

    def execute(self, query: str) -> None:
        self._capture["query"] = query

    def fetchall(self) -> list[dict[str, object]]:
        return list(self._rows)

    def close(self) -> None:
        self._capture["cursor_closed"] = True


class _FakePsycopgConnection:
    def __init__(self, rows: list[dict[str, object]], capture: dict[str, object]) -> None:
        self._rows = rows
        self._capture = capture

    def cursor(self) -> _FakePsycopgCursor:
        cursor = _FakePsycopgCursor(self._rows, self._capture)
        self._capture["cursor"] = cursor
        return cursor

    def close(self) -> None:
        self._capture["connection_closed"] = True


class _FakePsycopgModule:
    def __init__(self, rows: list[dict[str, object]], capture: dict[str, object]) -> None:
        self._rows = rows
        self._capture = capture

    def connect(self, *args, **kwargs):
        self._capture["connect_args"] = args
        self._capture["connect_kwargs"] = kwargs
        return _FakePsycopgConnection(self._rows, self._capture)


class _FakePyodbcModule:
    def __init__(self, rows: list[dict[str, object]], capture: dict[str, object]) -> None:
        self._rows = rows
        self._capture = capture

    def connect(self, connection_string: str):
        self._capture["connection_string"] = connection_string
        return _FakePsycopgConnection(self._rows, self._capture)


class _FakeOracleModule:
    def __init__(self, rows: list[dict[str, object]], capture: dict[str, object]) -> None:
        self._rows = rows
        self._capture = capture

    def connect(self, *args, **kwargs):
        self._capture["connect_args"] = args
        self._capture["connect_kwargs"] = kwargs
        return _FakePsycopgConnection(self._rows, self._capture)


class _FakeStream:
    def __init__(self, payload: str) -> None:
        self._payload = payload

    def read(self) -> bytes:
        return self._payload.encode("utf-8")


class _FakeBoto3Module:
    def __init__(self, payload: str, capture: dict[str, object]) -> None:
        self._payload = payload
        self._capture = capture

    def client(self, service_name: str, **kwargs):
        self._capture["service_name"] = service_name
        self._capture["client_kwargs"] = kwargs
        return self

    def get_object(self, Bucket: str, Key: str) -> dict[str, object]:
        self._capture["bucket"] = Bucket
        self._capture["key"] = Key
        return {"Body": _FakeStream(self._payload)}


class _FakeAzureDownload:
    def __init__(self, payload: str) -> None:
        self._payload = payload

    def readall(self) -> bytes:
        return self._payload.encode("utf-8")


class _FakeAzureBlobClient:
    def __init__(self, payload: str, capture: dict[str, object], container: str, blob: str) -> None:
        self._payload = payload
        self._capture = capture
        self._capture["container"] = container
        self._capture["blob"] = blob

    def download_blob(self) -> _FakeAzureDownload:
        return _FakeAzureDownload(self._payload)


class _FakeAzureBlobServiceClient:
    def __init__(self, payload: str, capture: dict[str, object], connection_string: str | None = None, **kwargs) -> None:
        self._payload = payload
        self._capture = capture
        if connection_string is not None:
            self._capture["connection_string"] = connection_string
        if kwargs:
            self._capture["azure_kwargs"] = kwargs

    @classmethod
    def from_connection_string(cls, connection_string: str):
        payload = cls._payload
        capture = cls._capture
        return cls(payload, capture, connection_string=connection_string)

    def get_blob_client(self, container: str, blob: str) -> _FakeAzureBlobClient:
        return _FakeAzureBlobClient(self._payload, self._capture, container, blob)


class _FakeAzureModule:
    def __init__(self, payload: str, capture: dict[str, object]) -> None:
        _FakeAzureBlobServiceClient._payload = payload
        _FakeAzureBlobServiceClient._capture = capture
        self.BlobServiceClient = _FakeAzureBlobServiceClient


class _FakeGcsBlob:
    def __init__(self, payload: str, capture: dict[str, object], blob_name: str) -> None:
        self._payload = payload
        self._capture = capture
        self._capture["blob"] = blob_name

    def download_as_text(self) -> str:
        return self._payload


class _FakeGcsBucket:
    def __init__(self, payload: str, capture: dict[str, object], bucket_name: str) -> None:
        self._payload = payload
        self._capture = capture
        self._capture["bucket"] = bucket_name

    def blob(self, blob_name: str) -> _FakeGcsBlob:
        return _FakeGcsBlob(self._payload, self._capture, blob_name)


class _FakeGcsClient:
    def __init__(self, payload: str | None = None, capture: dict[str, object] | None = None, **kwargs) -> None:
        self._payload = payload if payload is not None else self.__class__._payload
        self._capture = capture if capture is not None else self.__class__._capture
        if kwargs:
            self._capture["gcs_kwargs"] = kwargs

    @classmethod
    def from_service_account_json(cls, path: str):
        payload = cls._payload
        capture = cls._capture
        capture["service_account_json"] = path
        return cls(payload, capture)

    @classmethod
    def from_service_account_info(cls, info: dict[str, object]):
        payload = cls._payload
        capture = cls._capture
        capture["service_account_info"] = info
        return cls(payload, capture)

    def bucket(self, bucket_name: str) -> _FakeGcsBucket:
        return _FakeGcsBucket(self._payload, self._capture, bucket_name)


class _FakeGcsModule:
    def __init__(self, payload: str, capture: dict[str, object]) -> None:
        _FakeGcsClient._payload = payload
        _FakeGcsClient._capture = capture
        self.Client = _FakeGcsClient


class _FakeSnowflakeCursor:
    def __init__(self, capture: dict[str, object], rows: list[dict[str, object]] | None = None) -> None:
        self._capture = capture
        self._rows = list(rows or [])
        self._capture.setdefault("executed_sql", [])
        self._capture.setdefault("executemany_batches", [])
        self.description = [(key,) for key in self._rows[0].keys()] if self._rows else []

    def execute(self, sql: str) -> None:
        self._capture["query"] = sql
        self._capture["executed_sql"].append(sql)

    def executemany(self, sql: str, rows: list[tuple[object, ...]]) -> None:
        self._capture["executed_sql"].append(sql)
        self._capture["executemany_batches"].append(list(rows))

    def fetchall(self) -> list[dict[str, object]]:
        return list(self._rows)

    def close(self) -> None:
        self._capture["snowflake_cursor_closed"] = True


class _FakeSnowflakeConnection:
    def __init__(self, capture: dict[str, object], rows: list[dict[str, object]] | None = None) -> None:
        self._capture = capture
        self._rows = rows

    def cursor(self) -> _FakeSnowflakeCursor:
        return _FakeSnowflakeCursor(self._capture, self._rows)

    def commit(self) -> None:
        self._capture["committed"] = True

    def close(self) -> None:
        self._capture["snowflake_connection_closed"] = True


class _FakeSnowflakeConnectorModule:
    def __init__(self, capture: dict[str, object], rows: list[dict[str, object]] | None = None) -> None:
        self._capture = capture
        self._rows = rows

    def connect(self, **kwargs):
        self._capture["connect_kwargs"] = kwargs
        return _FakeSnowflakeConnection(self._capture, self._rows)


class _ImportProxy:
    def __init__(self, mapping: dict[str, object]) -> None:
        self._mapping = mapping

    def import_module(self, name: str):
        if name in self._mapping:
            return self._mapping[name]
        return REAL_IMPORT_MODULE(name)


class NoodlePipelineControlPlaneTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        sqlite_path = Path(self.temp_dir.name) / "noodle.db"
        settings = NoodleSettings(
            environment="test",
            workflow_backend="temporal",
            event_backbone="kafka",
            metadata_backend="datahub",
            lakehouse_format="iceberg",
            serving_api_base="/noodle",
            llm_provider="test",
            database_url=f"sqlite:///{sqlite_path.as_posix()}",
            allow_sqlite_fallback=False,
        )
        repository = NoodlePipelineRepository(
            settings=settings,
            storage_path=sqlite_path,
            legacy_json_path=Path(self.temp_dir.name) / "legacy.json",
        )
        self.service = NoodlePipelineControlPlaneService(repository=repository)
        self.document = self.service.save_pipeline(_build_test_document())

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_if_trigger_blocks_run_when_condition_false(self) -> None:
        response = self.service.create_run(
            self.document.id,
            NoodlePipelineRunCreateRequest(
                trigger="if",
                orchestration_mode="tasks",
                if_condition="false",
            ),
        )

        self.assertEqual(response.run.status, "cancelled")
        self.assertTrue(all(task.state == "skipped" for task in response.run.task_runs))
        self.assertTrue(any("If trigger evaluation" in log.message for log in response.run.logs))

    def test_plan_mode_uses_orchestrator_tasks(self) -> None:
        response = self.service.create_run(
            self.document.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="plan",
            ),
        )

        self.assertEqual(response.run.orchestration_mode, "plan")
        self.assertGreaterEqual(len(response.run.task_runs), 2)
        self.assertEqual(response.run.task_runs[0].node_label, "Ingest source")

    def test_stop_run_marks_active_tasks_cancelled(self) -> None:
        created = self.service.create_run(
            self.document.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="tasks",
            ),
        )

        self.assertEqual(created.run.status, "running")
        stopped = self.service.stop_run(self.document.id, created.run.id)

        self.assertEqual(stopped.run.status, "cancelled")
        self.assertIsNotNone(stopped.run.finished_at)
        self.assertEqual(stopped.run.task_runs[0].state, "cancelled")
        self.assertTrue(all(task.state == "cancelled" for task in stopped.run.task_runs))
        self.assertTrue(any("Run was stopped manually before completion." in log.message for log in stopped.run.logs))
        self.assertEqual(stopped.pipeline.runs[0].id, created.run.id)
        self.assertEqual(stopped.pipeline.batch_sessions[0].status, "failed")
        self.assertEqual(stopped.pipeline.batch_sessions[0].attempts[-1].status, "failed")

    def test_stop_run_rejects_terminal_runs(self) -> None:
        created = self.service.create_run(
            self.document.id,
            NoodlePipelineRunCreateRequest(
                trigger="if",
                orchestration_mode="tasks",
                if_condition="false",
            ),
        )

        self.assertEqual(created.run.status, "cancelled")
        with self.assertRaises(ValueError):
            self.service.stop_run(self.document.id, created.run.id)

    def test_pipeline_preserves_github_deployment_contract(self) -> None:
        deployment_document = NoodlePipelineDocument.model_validate(
            {
                **self.document.model_dump(),
                "deployment": {
                    "enabled": True,
                    "deploy_target": "local_docker",
                    "repository": {
                        "provider": "github",
                        "connection_id": None,
                        "repository": "acme/noodle-pipeline",
                        "branch": "main",
                        "backend_path": "app",
                        "workflow_ref": ".github/workflows/deploy.yml",
                    },
                    "build_command": "docker build -t noodle-pipeline-backend .",
                    "deploy_command": "docker compose up -d --build",
                    "artifact_name": "noodle-pipeline-backend",
                    "notes": "Deploy backend code from GitHub.",
                },
            }
        )
        saved = self.service.save_pipeline(deployment_document)

        response = self.service.create_run(
            saved.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="tasks",
            ),
        )

        self.assertTrue(saved.deployment.enabled)
        self.assertEqual(saved.deployment.repository.provider, "github")
        self.assertEqual(saved.deployment.repository.repository, "acme/noodle-pipeline")
        self.assertTrue(any("Deployment contract points to github repo 'acme/noodle-pipeline'" in log.message for log in response.run.logs))

    def test_cache_node_emits_cached_output_artifact(self) -> None:
        response = self.service.create_run(
            self.document.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="tasks",
            ),
        )

        self.assertEqual(len(response.run.cached_outputs), 1)
        cached_output = response.run.cached_outputs[0]
        self.assertEqual(cached_output.node_id, "node-cache")
        self.assertEqual(cached_output.source_node_id, "node-transform")
        self.assertGreater(cached_output.captured_bytes, 0)
        self.assertTrue(any("Cache node 'Cache' buffered" in log.message for log in response.run.logs))

    def test_unknown_manual_test_node_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            self.service.create_run(
                self.document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                    test_node_id="missing-node",
                ),
            )

    def test_runtime_execution_reads_connection_and_dumps_real_data(self) -> None:
        source_path = Path(self.temp_dir.name) / "orders.jsonl"
        dump_path = Path(self.temp_dir.name) / "artifacts" / "orders_dump.jsonl"
        source_records = [
            {"order_id": "A-100", "amount": 19.5},
            {"order_id": "A-101", "amount": 42.0},
        ]
        source_path.write_text(
            "\n".join(json.dumps(record) for record in source_records) + "\n",
            encoding="utf-8",
        )
        runtime_document = self.service.save_pipeline(_build_runtime_document(source_path, dump_path))

        response = self.service.create_run(
            runtime_document.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="tasks",
            ),
        )

        self.assertEqual(response.run.status, "success")
        self.assertTrue(all(task.state == "success" for task in response.run.task_runs))
        self.assertTrue(dump_path.exists())
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(len(response.run.cached_outputs), 1)
        self.assertIn(dump_path.as_posix(), response.run.cached_outputs[0].summary)
        self.assertTrue(any("Dumped 2 records" in log.message for log in response.run.logs))

    def test_runtime_execution_writes_using_first_class_sink_node(self) -> None:
        source_path = Path(self.temp_dir.name) / "orders_sink.jsonl"
        dump_path = Path(self.temp_dir.name) / "artifacts" / "orders_sink_output.jsonl"
        source_records = [
            {"order_id": "SINK-100", "amount": 77.5},
            {"order_id": "SINK-101", "amount": 88.0},
        ]
        source_path.write_text(
            "\n".join(json.dumps(record) for record in source_records) + "\n",
            encoding="utf-8",
        )
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                source_path,
                dump_path,
                dump_kind="sink",
                dump_params=[
                    {"key": "target_path", "value": dump_path.as_posix()},
                    {"key": "format", "value": "jsonl"},
                ],
            )
        )

        response = self.service.create_run(
            runtime_document.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="tasks",
            ),
        )

        self.assertEqual(response.run.status, "success")
        self.assertTrue(dump_path.exists())
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(len(response.run.cached_outputs), 1)
        self.assertEqual(response.run.cached_outputs[0].node_label, "Sink Orders")
        self.assertIn(dump_path.as_posix(), response.run.cached_outputs[0].summary)

    def test_runtime_execution_reads_github_connector_adapter(self) -> None:
        source_path = Path(self.temp_dir.name) / "github_events.jsonl"
        dump_path = Path(self.temp_dir.name) / "artifacts" / "github_events_dump.jsonl"
        source_records = [
            {"repository": "acme/platform", "event_type": "pull_request", "actor_login": "octocat"},
            {"repository": "acme/platform", "event_type": "push", "actor_login": "hubot"},
        ]
        source_path.write_text(
            "\n".join(json.dumps(record) for record in source_records) + "\n",
            encoding="utf-8",
        )
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                source_path,
                dump_path,
                connection_plugin="github-sync-connector",
                connection_id="conn-github",
                connection_name="github-events",
                source_label="GitHub Events",
            )
        )

        response = self.service.create_run(
            runtime_document.id,
            NoodlePipelineRunCreateRequest(
                trigger="manual",
                orchestration_mode="tasks",
            ),
        )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertTrue(any("GitHubConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_postgres_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "postgres_orders_dump.jsonl"
        source_records = [
            {"order_id": "P-100", "amount": 99.5},
            {"order_id": "P-101", "amount": 12.0},
        ]
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "postgresql://localhost:5432/orders",
                dump_path,
                connection_plugin="postgres-plugin",
                connection_id="conn-postgres",
                connection_name="postgres-orders",
                source_label="Postgres Orders",
                source_params=[{"key": "query", "value": "SELECT order_id, amount FROM orders"}],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"psycopg": _FakePsycopgModule(source_records, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["query"], "SELECT order_id, amount FROM orders")
        self.assertTrue(any("PostgresConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_sqlserver_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "sqlserver_orders_dump.jsonl"
        source_records = [
            {"order_id": "MSSQL-100", "amount": 71.0},
            {"order_id": "MSSQL-101", "amount": 72.0},
        ]
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "",
                dump_path,
                connection_plugin="sqlserver-plugin",
                connection_id="conn-sqlserver",
                connection_name="sqlserver-orders",
                source_label="SQL Server Orders",
                source_params=[
                    {"key": "table", "value": "dbo.orders"},
                    {"key": "limit", "value": "2"},
                ],
                connection_ref_params=[
                    {"key": "host", "value": "localhost"},
                    {"key": "port", "value": "1433"},
                    {"key": "database", "value": "app"},
                    {"key": "username", "value": "sa"},
                    {"key": "password", "value": "secret"},
                    {"key": "driver", "value": "ODBC Driver 18 for SQL Server"},
                    {"key": "trust_server_certificate", "value": "true"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"pyodbc": _FakePyodbcModule(source_records, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["query"], "SELECT TOP 2 * FROM [dbo].[orders]")
        self.assertIn("SERVER=localhost,1433", capture["connection_string"])
        self.assertIn("DATABASE=app", capture["connection_string"])
        self.assertTrue(any("SqlServerConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_azure_sql_via_generic_database_plugin(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "azure_sql_orders_dump.jsonl"
        source_records = [
            {"order_id": "AZSQL-100", "amount": 81.0},
            {"order_id": "AZSQL-101", "amount": 82.0},
        ]
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "",
                dump_path,
                connection_plugin="database-plugin",
                connection_id="conn-azure-sql",
                connection_name="azure-sql-orders",
                source_label="Azure SQL Orders",
                source_params=[{"key": "query", "value": "SELECT order_id, amount FROM sales.orders"}],
                connection_ref_params=[
                    {"key": "db_kind", "value": "azure_sql"},
                    {"key": "host", "value": "demo-server.database.windows.net"},
                    {"key": "port", "value": "1433"},
                    {"key": "database", "value": "sales"},
                    {"key": "username", "value": "demo_user"},
                    {"key": "password", "value": "secret"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"pyodbc": _FakePyodbcModule(source_records, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["query"], "SELECT order_id, amount FROM sales.orders")
        self.assertIn("Encrypt=yes", capture["connection_string"])
        self.assertTrue(any("AzureSqlConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_oracle_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "oracle_orders_dump.jsonl"
        source_records = [
            {"order_id": "ORA-100", "amount": 91.0},
            {"order_id": "ORA-101", "amount": 92.0},
        ]
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "",
                dump_path,
                connection_plugin="oracle-plugin",
                connection_id="conn-oracle",
                connection_name="oracle-orders",
                source_label="Oracle Orders",
                source_params=[
                    {"key": "table", "value": "HR.ORDERS"},
                    {"key": "limit", "value": "5"},
                ],
                connection_ref_params=[
                    {"key": "host", "value": "localhost"},
                    {"key": "port", "value": "1521"},
                    {"key": "service_name", "value": "FREEPDB1"},
                    {"key": "username", "value": "system"},
                    {"key": "password", "value": "secret"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"oracledb": _FakeOracleModule(source_records, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["query"], 'SELECT * FROM "HR"."ORDERS" FETCH FIRST 5 ROWS ONLY')
        self.assertEqual(capture["connect_kwargs"]["dsn"], "localhost:1521/FREEPDB1")
        self.assertTrue(any("OracleConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_snowflake_source_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "snowflake_source_orders_dump.jsonl"
        source_records = [
            {"order_id": "SNOWSRC-100", "amount": 111.0},
            {"order_id": "SNOWSRC-101", "amount": 112.0},
        ]
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "",
                dump_path,
                connection_plugin="snowflake-plugin",
                connection_id="conn-snowflake-source",
                connection_name="snowflake-source-orders",
                source_label="Snowflake Source Orders",
                source_params=[{"key": "query", "value": "SELECT order_id, amount FROM RAW.NOODLE.ORDERS"}],
                dump_params=[{"key": "sink_connection_ref", "value": "local-file"}],
                connection_ref_params=[
                    {"key": "account", "value": "demo-account"},
                    {"key": "user", "value": "demo-user"},
                    {"key": "password", "value": "demo-password"},
                    {"key": "warehouse", "value": "DEMO_WH"},
                    {"key": "database", "value": "RAW"},
                    {"key": "schema", "value": "NOODLE"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"snowflake.connector": _FakeSnowflakeConnectorModule(capture, source_records)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["query"], "SELECT order_id, amount FROM RAW.NOODLE.ORDERS")
        self.assertEqual(capture["connect_kwargs"]["account"], "demo-account")
        self.assertTrue(any("SnowflakeSourceConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_s3_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "s3_orders_dump.jsonl"
        source_records = [
            {"order_id": "S3-100", "amount": 10.0},
            {"order_id": "S3-101", "amount": 11.0},
        ]
        payload = "\n".join(json.dumps(record) for record in source_records) + "\n"
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                json.dumps({"region_name": "us-east-1"}),
                dump_path,
                connection_plugin="s3-plugin",
                connection_id="conn-s3",
                connection_name="orders-s3",
                source_label="S3 Orders",
                source_params=[
                    {"key": "bucket", "value": "orders-bucket"},
                    {"key": "key", "value": "landing/orders.jsonl"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"boto3": _FakeBoto3Module(payload, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["bucket"], "orders-bucket")
        self.assertEqual(capture["key"], "landing/orders.jsonl")
        self.assertTrue(any("S3ConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_azure_blob_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "azure_orders_dump.jsonl"
        source_records = [
            {"order_id": "AZ-100", "amount": 21.0},
            {"order_id": "AZ-101", "amount": 22.0},
        ]
        payload = "\n".join(json.dumps(record) for record in source_records) + "\n"
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "UseDevelopmentStorage=true",
                dump_path,
                connection_plugin="azure-blob-plugin",
                connection_id="conn-azure",
                connection_name="orders-azure",
                source_label="Azure Orders",
                source_params=[
                    {"key": "container", "value": "orders"},
                    {"key": "blob", "value": "landing/orders.jsonl"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"azure.storage.blob": _FakeAzureModule(payload, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["container"], "orders")
        self.assertEqual(capture["blob"], "landing/orders.jsonl")
        self.assertTrue(any("AzureBlobConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_reads_gcs_and_dumps_local_data(self) -> None:
        dump_path = Path(self.temp_dir.name) / "artifacts" / "gcs_orders_dump.jsonl"
        source_records = [
            {"order_id": "GS-100", "amount": 31.0},
            {"order_id": "GS-101", "amount": 32.0},
        ]
        payload = "\n".join(json.dumps(record) for record in source_records) + "\n"
        capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "",
                dump_path,
                connection_plugin="gcs-plugin",
                connection_id="conn-gcs",
                connection_name="orders-gcs",
                source_label="GCS Orders",
                source_params=[
                    {"key": "bucket", "value": "orders-bucket"},
                    {"key": "blob", "value": "landing/orders.jsonl"},
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"google.cloud.storage": _FakeGcsModule(payload, capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        dumped_records = [
            json.loads(line)
            for line in dump_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(dumped_records, source_records)
        self.assertEqual(capture["bucket"], "orders-bucket")
        self.assertEqual(capture["blob"], "landing/orders.jsonl")
        self.assertTrue(any("GcsConnectorAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_loads_postgres_into_snowflake(self) -> None:
        source_records = [
            {"order_id": "SF-100", "amount": 301.0},
            {"order_id": "SF-101", "amount": 302.0},
        ]
        postgres_capture: dict[str, object] = {}
        snowflake_capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "postgresql://localhost:5432/orders",
                None,
                connection_plugin="postgres-plugin",
                connection_id="conn-postgres",
                connection_name="postgres-orders",
                source_label="Postgres Orders",
                source_params=[{"key": "table", "value": "public.orders"}],
                dump_params=[
                    {"key": "sink_connection_ref", "value": "conn-snowflake"},
                    {"key": "snowflake_database", "value": "RAW"},
                    {"key": "snowflake_schema", "value": "NOODLE"},
                    {"key": "snowflake_table", "value": "ORDERS"},
                    {"key": "truncate_before_load", "value": "true"},
                ],
                extra_connections=[
                    {
                        "id": "conn-snowflake",
                        "name": "snowflake-target",
                        "plugin": "snowflake-plugin",
                        "environment": "test",
                        "auth_ref": json.dumps(
                            {
                                "account": "demo-account",
                                "user": "demo-user",
                                "password": "demo-password",
                                "warehouse": "DEMO_WH",
                            }
                        ),
                        "notes": "Integration test Snowflake target.",
                    }
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"psycopg": _FakePsycopgModule(source_records, postgres_capture)}),
        ), patch(
            "app.noodle.connectors.sink_adapters.importlib",
            new=_ImportProxy({"snowflake.connector": _FakeSnowflakeConnectorModule(snowflake_capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        self.assertEqual(postgres_capture["query"], 'SELECT * FROM "public"."orders"')
        self.assertTrue(snowflake_capture["committed"])
        self.assertTrue(any("TRUNCATE TABLE" in sql for sql in snowflake_capture["executed_sql"]))
        self.assertEqual(
            snowflake_capture["executemany_batches"][0],
            [("SF-100", 301.0), ("SF-101", 302.0)],
        )
        self.assertIn('"RAW"."NOODLE"."ORDERS"', response.run.cached_outputs[0].summary)
        self.assertTrue(any("SnowflakeSinkAdapter" in log.message for log in response.run.logs))

    def test_runtime_execution_loads_postgres_into_snowflake_with_structured_target_params(self) -> None:
        source_records = [
            {"order_id": "SFP-100", "amount": 321.0},
            {"order_id": "SFP-101", "amount": 322.0},
        ]
        postgres_capture: dict[str, object] = {}
        snowflake_capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "postgresql://localhost:5432/orders",
                None,
                connection_plugin="postgres-plugin",
                connection_id="conn-postgres",
                connection_name="postgres-orders",
                source_label="Postgres Orders",
                source_params=[{"key": "query", "value": "SELECT order_id, amount FROM orders"}],
                dump_params=[
                    {"key": "sink_connection_ref", "value": "conn-snowflake"},
                    {"key": "snowflake_database", "value": "RAW"},
                    {"key": "snowflake_schema", "value": "NOODLE"},
                    {"key": "snowflake_table", "value": "STRUCTURED_ORDERS"},
                ],
                extra_connections=[
                    {
                        "id": "conn-snowflake",
                        "name": "snowflake-target",
                        "plugin": "snowflake-plugin",
                        "environment": "test",
                        "auth_ref": "",
                        "params": [
                            {"key": "account", "value": "demo-account"},
                            {"key": "user", "value": "demo-user"},
                            {"key": "password", "value": "demo-password"},
                            {"key": "warehouse", "value": "DEMO_WH"},
                        ],
                        "notes": "Structured Snowflake target.",
                    }
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"psycopg": _FakePsycopgModule(source_records, postgres_capture)}),
        ), patch(
            "app.noodle.connectors.sink_adapters.importlib",
            new=_ImportProxy({"snowflake.connector": _FakeSnowflakeConnectorModule(snowflake_capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        self.assertEqual(snowflake_capture["connect_kwargs"]["account"], "demo-account")
        self.assertIn('"RAW"."NOODLE"."STRUCTURED_ORDERS"', response.run.cached_outputs[0].summary)

    def test_runtime_execution_loads_s3_into_snowflake(self) -> None:
        source_records = [
            {"order_id": "S3SF-100", "amount": 401.0},
            {"order_id": "S3SF-101", "amount": 402.0},
        ]
        payload = "\n".join(json.dumps(record) for record in source_records) + "\n"
        s3_capture: dict[str, object] = {}
        snowflake_capture: dict[str, object] = {}
        runtime_document = self.service.save_pipeline(
            _build_runtime_document(
                "",
                None,
                connection_plugin="s3-plugin",
                connection_id="conn-s3",
                connection_name="orders-s3",
                source_label="S3 Orders",
                source_params=[
                    {"key": "bucket", "value": "orders-bucket"},
                    {"key": "key", "value": "landing/orders.jsonl"},
                ],
                dump_params=[
                    {"key": "sink_connection_ref", "value": "conn-snowflake"},
                    {"key": "snowflake_database", "value": "RAW"},
                    {"key": "snowflake_schema", "value": "NOODLE"},
                    {"key": "snowflake_table", "value": "S3_ORDERS"},
                ],
                extra_connections=[
                    {
                        "id": "conn-snowflake",
                        "name": "snowflake-target",
                        "plugin": "snowflake-plugin",
                        "environment": "test",
                        "auth_ref": json.dumps(
                            {
                                "account": "demo-account",
                                "user": "demo-user",
                                "password": "demo-password",
                                "warehouse": "DEMO_WH",
                            }
                        ),
                        "notes": "Integration test Snowflake target.",
                    }
                ],
            )
        )

        with patch(
            "app.noodle.connectors.adapters.importlib",
            new=_ImportProxy({"boto3": _FakeBoto3Module(payload, s3_capture)}),
        ), patch(
            "app.noodle.connectors.sink_adapters.importlib",
            new=_ImportProxy({"snowflake.connector": _FakeSnowflakeConnectorModule(snowflake_capture)}),
        ):
            response = self.service.create_run(
                runtime_document.id,
                NoodlePipelineRunCreateRequest(
                    trigger="manual",
                    orchestration_mode="tasks",
                ),
            )

        self.assertEqual(response.run.status, "success")
        self.assertTrue(snowflake_capture["committed"])
        self.assertIn('"RAW"."NOODLE"."S3_ORDERS"', response.run.cached_outputs[0].summary)
        self.assertTrue(any("S3ConnectorAdapter" in log.message for log in response.run.logs))
        self.assertTrue(any("SnowflakeSinkAdapter" in log.message for log in response.run.logs))


class NoodleConnectorAdapterRegistryTests(unittest.TestCase):
    def test_registry_resolves_github_plugin_alias(self) -> None:
        registry = NoodleConnectorAdapterRegistry()
        adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-1",
                    name="github",
                    plugin="github-sync-connector",
                    environment="saas",
                    auth_ref="file://C:/tmp/github.jsonl",
                    notes="",
                ),
                source_node=NoodleDesignerNode.model_validate(
                    {
                        "id": "node-1",
                        "label": "GitHub",
                        "kind": "source",
                        "position": {"x": 0, "y": 0},
                        "params": [{"key": "format", "value": "jsonl"}],
                    }
                ),
            )
        )

        self.assertIsInstance(adapter, GitHubConnectorAdapter)

    def test_registry_resolves_live_ingestion_adapters(self) -> None:
        registry = NoodleConnectorAdapterRegistry()
        source_node = NoodleDesignerNode.model_validate(
            {
                "id": "node-1",
                "label": "Orders",
                "kind": "source",
                "position": {"x": 0, "y": 0},
                "params": [{"key": "query", "value": "SELECT 1"}],
            }
        )
        postgres_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-postgres",
                    name="postgres",
                    plugin="postgres-plugin",
                    environment="dev",
                    auth_ref="postgresql://localhost:5432/app",
                    notes="",
                ),
                source_node=source_node,
            )
        )
        sqlserver_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-sqlserver",
                    name="sqlserver",
                    plugin="sqlserver-plugin",
                    environment="dev",
                    auth_ref="",
                    params=[{"key": "host", "value": "localhost"}],
                    notes="",
                ),
                source_node=source_node,
            )
        )
        azure_sql_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-azure-sql",
                    name="azure-sql",
                    plugin="database-plugin",
                    environment="dev",
                    auth_ref="",
                    params=[
                        {"key": "db_kind", "value": "azure_sql"},
                        {"key": "host", "value": "demo-server.database.windows.net"},
                    ],
                    notes="",
                ),
                source_node=source_node,
            )
        )
        oracle_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-oracle",
                    name="oracle",
                    plugin="oracle-plugin",
                    environment="dev",
                    auth_ref="",
                    params=[
                        {"key": "host", "value": "localhost"},
                        {"key": "service_name", "value": "FREEPDB1"},
                    ],
                    notes="",
                ),
                source_node=source_node,
            )
        )
        snowflake_source_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-snowflake",
                    name="snowflake",
                    plugin="snowflake-plugin",
                    environment="dev",
                    auth_ref="",
                    params=[{"key": "account", "value": "demo-account"}],
                    notes="",
                ),
                source_node=source_node,
            )
        )
        s3_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-s3",
                    name="s3",
                    plugin="s3-plugin",
                    environment="dev",
                    auth_ref="",
                    notes="",
                ),
                source_node=NoodleDesignerNode.model_validate(
                    {
                        "id": "node-2",
                        "label": "S3",
                        "kind": "source",
                        "position": {"x": 0, "y": 0},
                        "params": [
                            {"key": "bucket", "value": "orders"},
                            {"key": "key", "value": "landing/orders.jsonl"},
                        ],
                    }
                ),
            )
        )
        azure_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-azure",
                    name="azure",
                    plugin="azure-blob-plugin",
                    environment="dev",
                    auth_ref="UseDevelopmentStorage=true",
                    notes="",
                ),
                source_node=NoodleDesignerNode.model_validate(
                    {
                        "id": "node-3",
                        "label": "Azure",
                        "kind": "source",
                        "position": {"x": 0, "y": 0},
                        "params": [
                            {"key": "container", "value": "orders"},
                            {"key": "blob", "value": "landing/orders.jsonl"},
                        ],
                    }
                ),
            )
        )
        gcs_adapter = registry.resolve(
            NoodleConnectorAdapterContext(
                connection=NoodleDesignerConnectionRef(
                    id="conn-gcs",
                    name="gcs",
                    plugin="gcs-plugin",
                    environment="dev",
                    auth_ref="",
                    notes="",
                ),
                source_node=NoodleDesignerNode.model_validate(
                    {
                        "id": "node-4",
                        "label": "GCS",
                        "kind": "source",
                        "position": {"x": 0, "y": 0},
                        "params": [
                            {"key": "bucket", "value": "orders"},
                            {"key": "blob", "value": "landing/orders.jsonl"},
                        ],
                    }
                ),
            )
        )

        self.assertIsInstance(postgres_adapter, PostgresConnectorAdapter)
        self.assertIsInstance(sqlserver_adapter, SqlServerConnectorAdapter)
        self.assertIsInstance(azure_sql_adapter, GenericDatabaseConnectorAdapter)
        self.assertIsInstance(oracle_adapter, OracleConnectorAdapter)
        self.assertIsInstance(snowflake_source_adapter, SnowflakeSourceConnectorAdapter)
        self.assertIsInstance(s3_adapter, S3ConnectorAdapter)
        self.assertIsInstance(azure_adapter, AzureBlobConnectorAdapter)
        self.assertIsInstance(gcs_adapter, GcsConnectorAdapter)

    def test_runtime_uses_default_adapter_registry(self) -> None:
        runtime = NoodlePipelineRuntimeService()

        self.assertIsInstance(runtime.adapter_registry, NoodleConnectorAdapterRegistry)
        self.assertIsInstance(runtime.sink_adapter_registry, NoodleSinkAdapterRegistry)
        self.assertTrue(any(isinstance(adapter, GenericFileConnectorAdapter) for adapter in runtime.adapter_registry.adapters))
        self.assertTrue(any(isinstance(adapter, SnowflakeSinkAdapter) for adapter in runtime.sink_adapter_registry.adapters))


if __name__ == "__main__":
    unittest.main()
