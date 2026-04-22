from __future__ import annotations

import json
import tempfile
from pathlib import Path

from app.noodle.config import NoodleSettings
from app.noodle.pipeline_service import NoodlePipelineControlPlaneService
from app.noodle.repository import NoodlePipelineRepository
from app.noodle.schemas import NoodlePipelineDocument, NoodlePipelineRunCreateRequest


def _build_topology_document(
    *,
    source_specs: list[dict[str, object]],
    sink_specs: list[dict[str, object]],
) -> NoodlePipelineDocument:
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

    return NoodlePipelineDocument.model_validate(
        {
            "id": "pipeline-topology",
            "name": "pipeline-topology",
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
                    "id": "tx-topology",
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
    )


def _create_service(temp_dir: str) -> NoodlePipelineControlPlaneService:
    sqlite_path = Path(temp_dir) / "noodle-topology.db"
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


def _run_topology(
    *,
    source_payloads: list[list[dict[str, object]]],
    sink_count: int,
) -> dict[str, object]:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        service = _create_service(temp_dir)

        source_specs: list[dict[str, object]] = []
        for index, payload in enumerate(source_payloads, start=1):
            source_path = temp_root / f"source_{index}.jsonl"
            _write_source_file(source_path, payload)
            source_specs.append({"label": f"Source {index}", "path": source_path})

        sink_specs: list[dict[str, object]] = []
        for index in range(1, sink_count + 1):
            sink_path = temp_root / "artifacts" / f"sink_{index}.jsonl"
            sink_specs.append({"label": f"Sink {index}", "path": sink_path})

        document = service.save_pipeline(
            _build_topology_document(source_specs=source_specs, sink_specs=sink_specs)
        )
        response = service.create_run(
            document.id,
            NoodlePipelineRunCreateRequest(trigger="manual", orchestration_mode="tasks"),
        )

        persisted_sink_paths = [Path(str(spec["path"])) for spec in sink_specs]
        output_payloads = [_read_output_file(path) for path in persisted_sink_paths]
        return {
            "status": response.run.status,
            "cached_outputs": response.run.cached_outputs,
            "logs": response.run.logs,
            "output_payloads": output_payloads,
            "sink_paths": [path.as_posix() for path in persisted_sink_paths],
            "sink_exists": [path.exists() for path in persisted_sink_paths],
        }


def test_single_source_single_target_topology() -> None:
    result = _run_topology(
        source_payloads=[[{"order_id": "A-1", "amount": 10.0}, {"order_id": "A-2", "amount": 20.0}]],
        sink_count=1,
    )

    assert result["status"] == "success"
    assert result["sink_exists"][0] is True
    assert result["output_payloads"][0] == [
        {"order_id": "A-1", "amount": 10.0},
        {"order_id": "A-2", "amount": 20.0},
    ]
    assert len(result["cached_outputs"]) == 1


def test_multi_source_single_target_topology() -> None:
    result = _run_topology(
        source_payloads=[
            [{"order_id": "B-1", "amount": 11.0}],
            [{"order_id": "C-1", "amount": 12.0}],
        ],
        sink_count=1,
    )

    assert result["status"] == "success"
    assert result["sink_exists"][0] is True
    assert len(result["output_payloads"][0]) == 2
    assert {item["_source_node"] for item in result["output_payloads"][0]} == {"Source 1", "Source 2"}
    assert {item["_connection"] for item in result["output_payloads"][0]} == {"source-1", "source-2"}


def test_single_source_multi_target_topology() -> None:
    source_records = [{"order_id": "D-1", "amount": 30.0}, {"order_id": "D-2", "amount": 31.0}]
    result = _run_topology(
        source_payloads=[source_records],
        sink_count=2,
    )

    assert result["status"] == "success"
    assert all(result["sink_exists"])
    assert result["output_payloads"][0] == source_records
    assert result["output_payloads"][1] == source_records
    assert len(result["cached_outputs"]) == 2


def test_multi_source_multi_target_topology() -> None:
    result = _run_topology(
        source_payloads=[
            [{"order_id": "E-1", "amount": 40.0}],
            [{"order_id": "F-1", "amount": 50.0}],
        ],
        sink_count=2,
    )

    assert result["status"] == "success"
    assert all(result["sink_exists"])
    for output_payload in result["output_payloads"]:
        assert len(output_payload) == 2
        assert {item["_source_node"] for item in output_payload} == {"Source 1", "Source 2"}
    assert len(result["cached_outputs"]) == 2
