import tempfile
import unittest
from pathlib import Path

from app.noodle.config import NoodleSettings
from app.noodle.pipeline_service import NoodlePipelineControlPlaneService
from app.noodle.repository import NoodlePipelineRepository
from app.noodle.schemas import NoodlePipelineDocument, NoodlePipelineRunCreateRequest


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


if __name__ == "__main__":
    unittest.main()
