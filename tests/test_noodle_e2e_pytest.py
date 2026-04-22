from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.noodle.api as noodle_api
from app.noodle.api import router as noodle_router
from app.noodle.config import NoodleSettings
from app.noodle.pipeline_service import NoodlePipelineControlPlaneService
from app.noodle.repository import NoodlePipelineRepository


def _build_api_topology_document(
    *,
    pipeline_id: str,
    source_specs: list[dict[str, object]],
    sink_specs: list[dict[str, object]],
) -> dict[str, object]:
    nodes: list[dict[str, object]] = []
    edges: list[dict[str, object]] = []
    connection_refs: list[dict[str, object]] = []

    for source_index, source_spec in enumerate(source_specs, start=1):
        source_id = f"node-source-{source_index}"
        connection_id = f"conn-source-{source_index}"
        nodes.append(
            {
                "id": source_id,
                "label": str(source_spec["label"]),
                "kind": "source",
                "position": {"x": 0, "y": source_index * 120},
                "params": [
                    {"key": "connection_ref", "value": connection_id},
                    {"key": "format", "value": "jsonl"},
                ],
            }
        )
        connection_refs.append(
            {
                "id": connection_id,
                "name": f"source-{source_index}",
                "plugin": "file-plugin",
                "environment": "test",
                "auth_ref": Path(str(source_spec["path"])).as_posix(),
                "params": [],
                "notes": f"Source connection {source_index}.",
            }
        )

    nodes.append(
        {
            "id": "node-transform",
            "label": "Normalize Orders",
            "kind": "transform",
            "position": {"x": 180, "y": 120},
            "params": [],
        }
    )

    for source_index in range(1, len(source_specs) + 1):
        edges.append(
            {
                "id": f"edge-source-{source_index}",
                "source": f"node-source-{source_index}",
                "target": "node-transform",
            }
        )

    for sink_index, sink_spec in enumerate(sink_specs, start=1):
        sink_id = f"node-sink-{sink_index}"
        nodes.append(
            {
                "id": sink_id,
                "label": str(sink_spec["label"]),
                "kind": "sink",
                "position": {"x": 360, "y": sink_index * 120},
                "params": [
                    {"key": "target_path", "value": Path(str(sink_spec["path"])).as_posix()},
                    {"key": "format", "value": "jsonl"},
                    {"key": "write_semantics", "value": "idempotent"},
                ],
            }
        )
        edges.append(
            {
                "id": f"edge-sink-{sink_index}",
                "source": "node-transform",
                "target": sink_id,
            }
        )

    return {
        "id": pipeline_id,
        "name": pipeline_id,
        "status": "published",
        "version": 1,
        "saved_at": "2026-01-01T00:00:00+00:00",
        "nodes": nodes,
        "edges": edges,
        "connection_refs": connection_refs,
        "metadata_assets": [],
        "schemas": [],
        "transformations": [
            {
                "id": f"tx-{pipeline_id}",
                "node_id": "node-transform",
                "name": "Normalize topology payload",
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


def _create_service(temp_dir: str) -> NoodlePipelineControlPlaneService:
    sqlite_path = Path(temp_dir) / "noodle-e2e.db"
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
        legacy_json_path=Path(temp_dir) / "legacy.json",
    )
    return NoodlePipelineControlPlaneService(repository=repository)


def _write_source_file(path: Path, records: list[dict[str, object]]) -> None:
    path.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")


def _read_output_file(path: Path) -> list[dict[str, object]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


@pytest.mark.parametrize(
    ("topology_name", "source_payloads", "sink_count"),
    [
        (
            "single-source-single-target",
            [[{"order_id": "A-1", "amount": 10.0}, {"order_id": "A-2", "amount": 20.0}]],
            1,
        ),
        (
            "multi-source-single-target",
            [[{"order_id": "B-1", "amount": 11.0}], [{"order_id": "C-1", "amount": 12.0}]],
            1,
        ),
        (
            "single-source-multi-target",
            [[{"order_id": "D-1", "amount": 30.0}, {"order_id": "D-2", "amount": 31.0}]],
            2,
        ),
        (
            "multi-source-multi-target",
            [[{"order_id": "E-1", "amount": 40.0}], [{"order_id": "F-1", "amount": 50.0}]],
            2,
        ),
    ],
)
def test_noodle_pipeline_end_to_end_topologies_via_api(
    topology_name: str,
    source_payloads: list[list[dict[str, object]]],
    sink_count: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        service = _create_service(temp_dir)
        app = FastAPI()
        app.include_router(noodle_router)
        client = TestClient(app)
        monkeypatch.setattr(noodle_api, "get_noodle_pipeline_control_plane", lambda: service)

        source_specs: list[dict[str, object]] = []
        for index, payload in enumerate(source_payloads, start=1):
            source_path = temp_root / f"{topology_name}_source_{index}.jsonl"
            _write_source_file(source_path, payload)
            source_specs.append({"label": f"Source {index}", "path": source_path})

        sink_paths: list[Path] = []
        sink_specs: list[dict[str, object]] = []
        for index in range(1, sink_count + 1):
            sink_path = temp_root / "artifacts" / f"{topology_name}_sink_{index}.jsonl"
            sink_paths.append(sink_path)
            sink_specs.append({"label": f"Sink {index}", "path": sink_path})

        pipeline_document = _build_api_topology_document(
            pipeline_id=f"pipeline-{topology_name}",
            source_specs=source_specs,
            sink_specs=sink_specs,
        )

        save_response = client.post("/noodle/pipelines", json=pipeline_document)
        assert save_response.status_code == 200

        run_response = client.post(
            f"/noodle/pipelines/{pipeline_document['id']}/runs",
            json={"trigger": "manual", "orchestration_mode": "tasks"},
        )
        assert run_response.status_code == 200
        payload = run_response.json()
        assert payload["run"]["status"] == "success"
        assert len(payload["run"]["cached_outputs"]) == sink_count

        output_payloads = [_read_output_file(path) for path in sink_paths]
        if len(source_payloads) == 1:
            for output_payload in output_payloads:
                assert output_payload == source_payloads[0]
        else:
            for output_payload in output_payloads:
                assert len(output_payload) == len(source_payloads)
                assert {item["_source_node"] for item in output_payload} == {"Source 1", "Source 2"}
                assert {item["_connection"] for item in output_payload} == {"source-1", "source-2"}

        client.close()


def test_noodle_pipeline_end_to_end_with_cache_and_sink_terminals(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        service = _create_service(temp_dir)
        app = FastAPI()
        app.include_router(noodle_router)
        client = TestClient(app)
        monkeypatch.setattr(noodle_api, "get_noodle_pipeline_control_plane", lambda: service)

        source_records = [{"order_id": "M-1", "amount": 91.0}, {"order_id": "M-2", "amount": 92.0}]
        source_path = temp_root / "mixed_source.jsonl"
        sink_path = temp_root / "artifacts" / "mixed_sink.jsonl"
        _write_source_file(source_path, source_records)

        pipeline_document = {
            "id": "pipeline-cache-and-sink",
            "name": "pipeline-cache-and-sink",
            "status": "published",
            "version": 1,
            "saved_at": "2026-01-01T00:00:00+00:00",
            "nodes": [
                {
                    "id": "node-source",
                    "label": "Orders Source",
                    "kind": "source",
                    "position": {"x": 0, "y": 0},
                    "params": [
                        {"key": "connection_ref", "value": "conn-source"},
                        {"key": "format", "value": "jsonl"},
                    ],
                },
                {
                    "id": "node-transform",
                    "label": "Normalize Orders",
                    "kind": "transform",
                    "position": {"x": 140, "y": 0},
                    "params": [],
                },
                {
                    "id": "node-cache",
                    "label": "Orders Cache",
                    "kind": "cache",
                    "position": {"x": 300, "y": -80},
                    "params": [
                        {"key": "output_path", "value": (temp_root / "artifacts" / "mixed_cache.jsonl").as_posix()},
                        {"key": "format", "value": "jsonl"},
                    ],
                },
                {
                    "id": "node-sink",
                    "label": "Orders Sink",
                    "kind": "sink",
                    "position": {"x": 300, "y": 80},
                    "params": [
                        {"key": "target_path", "value": sink_path.as_posix()},
                        {"key": "format", "value": "jsonl"},
                        {"key": "write_semantics", "value": "idempotent"},
                    ],
                },
            ],
            "edges": [
                {"id": "edge-1", "source": "node-source", "target": "node-transform"},
                {"id": "edge-2", "source": "node-transform", "target": "node-cache"},
                {"id": "edge-3", "source": "node-transform", "target": "node-sink"},
            ],
            "connection_refs": [
                {
                    "id": "conn-source",
                    "name": "source-1",
                    "plugin": "file-plugin",
                    "environment": "test",
                    "auth_ref": source_path.as_posix(),
                    "params": [],
                    "notes": "Source connection.",
                }
            ],
            "metadata_assets": [],
            "schemas": [],
            "transformations": [
                {
                    "id": "tx-mixed",
                    "node_id": "node-transform",
                    "name": "Normalize mixed payload",
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

        save_response = client.post("/noodle/pipelines", json=pipeline_document)
        assert save_response.status_code == 200

        run_response = client.post(
            "/noodle/pipelines/pipeline-cache-and-sink/runs",
            json={"trigger": "manual", "orchestration_mode": "tasks"},
        )
        assert run_response.status_code == 200
        payload = run_response.json()
        assert payload["run"]["status"] == "success"
        assert len(payload["run"]["cached_outputs"]) == 2
        assert {item["node_label"] for item in payload["run"]["cached_outputs"]} == {"Orders Cache", "Orders Sink"}
        assert _read_output_file(sink_path) == source_records

        client.close()
