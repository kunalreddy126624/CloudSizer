from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from app.noodle.repository import NoodlePipelineRepository
from app.noodle.runtime import NoodlePipelineRuntimeService
from app.noodle.schemas import (
    NoodleDesignerCachedOutput,
    DesignerOrchestrationMode,
    NoodleDesignerRun,
    NoodleDesignerRunLog,
    NoodleDesignerRunTask,
    NoodleDesignerTransformation,
    NoodlePipelineDocument,
    NoodlePipelineRunCreateRequest,
    NoodlePipelineRunResponse,
)

CACHE_CAPTURE_LIMIT_BYTES = 30 * 1024 * 1024
CACHE_PREVIEW_LIMIT_BYTES = 256 * 1024
CACHE_OBSERVABLE_UPSTREAM_KINDS = {"transform", "quality", "feature", "serve"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_log(level: str, message: str, node_id: str | None = None) -> NoodleDesignerRunLog:
    return NoodleDesignerRunLog(
        id=f"run-log-{uuid4().hex[:10]}",
        timestamp=_utc_now(),
        level=level,
        message=message,
        node_id=node_id,
    )


def _titleize(value: str) -> str:
    return value.replace("_", " ").title()


def _node_param_map(node) -> dict[str, str]:
    return {param.key.strip().lower(): param.value.strip() for param in node.params if param.key.strip()}


def _coerce_positive_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _repeat_to_size(seed: str, target_bytes: int) -> str:
    if target_bytes <= 0:
        return ""
    encoded = seed.encode("utf-8")
    if len(encoded) >= target_bytes:
        return encoded[:target_bytes].decode("utf-8", errors="ignore")

    chunks = [seed]
    total_bytes = len(encoded)
    while total_bytes < target_bytes:
        chunks.append(seed)
        total_bytes += len(encoded)
    return "\n".join(chunks).encode("utf-8")[:target_bytes].decode("utf-8", errors="ignore")


def _evaluate_if_condition(condition: str | None) -> tuple[bool, str]:
    normalized = (condition or "").strip().lower()
    if not normalized:
        return False, "No condition provided."
    if normalized in {"true", "1", "yes", "pass", "approved"}:
        return True, "Condition evaluated to true."
    if normalized in {"false", "0", "no", "fail", "blocked"}:
        return False, "Condition evaluated to false."
    # Treat unknown expressions as unresolved so conditional runs do not execute accidentally.
    return False, f"Condition expression '{condition}' is unresolved; expected a true/false style value."


def _build_transformation_logs(
    transformations: list[NoodleDesignerTransformation],
    test_node_id: str | None,
) -> list[NoodleDesignerRunLog]:
    scoped = (
        [item for item in transformations if item.node_id == test_node_id or item.id == test_node_id]
        if test_node_id
        else transformations
    )
    if not scoped:
        return [_run_log("warn", "No transformation rules were selected for this run.")]

    logs: list[NoodleDesignerRunLog] = []
    for transformation in scoped:
        logs.append(
            _run_log(
                "info",
                f"Applied transformation rule '{transformation.name}' using {transformation.mode} via {transformation.plugin}.",
                transformation.node_id,
            )
        )
    return logs


def _build_cached_outputs(
    document: NoodlePipelineDocument,
    test_node_id: str | None,
) -> list[NoodleDesignerCachedOutput]:
    node_by_id = {node.id: node for node in document.nodes}
    transformation_by_node_id = {
        transformation.node_id: transformation
        for transformation in document.transformations
        if transformation.node_id
    }
    upstream_map: dict[str, list[str]] = {}
    for edge in document.edges:
        upstream_map.setdefault(edge.target, []).append(edge.source)

    selected_node = node_by_id.get(test_node_id) if test_node_id else None
    cached_outputs: list[NoodleDesignerCachedOutput] = []
    for cache_node in document.nodes:
        if cache_node.kind != "cache":
            continue

        upstream_ids = upstream_map.get(cache_node.id, [])
        if selected_node and cache_node.id != selected_node.id and selected_node.id not in upstream_ids:
            continue

        upstream_nodes = [node_by_id[node_id] for node_id in upstream_ids if node_id in node_by_id]
        if not upstream_nodes:
            continue

        source_node = next(
            (node for node in upstream_nodes if node.kind in CACHE_OBSERVABLE_UPSTREAM_KINDS),
            upstream_nodes[0],
        )
        params = _node_param_map(cache_node)
        max_capture_mb = min(_coerce_positive_int(params.get("max_capture_mb"), 30), 30)
        max_capture_bytes = min(max_capture_mb * 1024 * 1024, CACHE_CAPTURE_LIMIT_BYTES)
        preview_kb = min(_coerce_positive_int(params.get("preview_kb"), 256), 512)
        preview_bytes_limit = min(preview_kb * 1024, max_capture_bytes, CACHE_PREVIEW_LIMIT_BYTES)
        output_format = params.get("format", "jsonl").lower()
        if output_format not in {"jsonl", "json", "csv", "text"}:
            output_format = "jsonl"

        transformation = transformation_by_node_id.get(source_node.id)
        transform_name = transformation.name if transformation else f"{source_node.label} pass-through"
        payload = {
            "cache_node": cache_node.label,
            "source_node": source_node.label,
            "transform": transform_name,
            "partition": "2026-04-09/hour=17",
            "status": "captured",
            "metrics": {
                "rows_in": 183420,
                "rows_out": 176884,
                "latency_ms": 842,
            },
        }
        if output_format == "json":
            seed_preview = json.dumps(payload, indent=2)
        elif output_format == "csv":
            seed_preview = "\n".join(
                [
                    "cache_node,source_node,transform,partition,status,rows_out",
                    f"{cache_node.label},{source_node.label},{transform_name},2026-04-09/hour=17,captured,176884",
                ]
            )
        elif output_format == "text":
            seed_preview = (
                f"Cache node: {cache_node.label}\n"
                f"Source node: {source_node.label}\n"
                f"Transformation: {transform_name}\n"
                "Rows out: 176884\n"
                "Status: captured"
            )
        else:
            seed_preview = "\n".join(
                json.dumps(
                    {
                        **payload,
                        "record_id": index,
                        "normalized_value": f"value-{index:05d}",
                        "quality_state": "accepted" if index % 5 else "needs_review",
                    }
                )
                for index in range(1, 7)
            )

        preview_text = _repeat_to_size(seed_preview, preview_bytes_limit)
        preview_bytes = len(preview_text.encode("utf-8"))
        captured_bytes = min(max_capture_bytes, max(preview_bytes, 12 * 1024 * 1024))
        cached_outputs.append(
            NoodleDesignerCachedOutput(
                id=f"cache-output-{uuid4().hex[:10]}",
                node_id=cache_node.id,
                node_label=cache_node.label,
                source_node_id=source_node.id,
                source_node_label=source_node.label,
                format=output_format,
                content_type=(
                    "application/json"
                    if output_format == "json"
                    else "text/csv"
                    if output_format == "csv"
                    else "text/plain"
                    if output_format == "text"
                    else "application/x-ndjson"
                ),
                summary=(
                    f"{cache_node.label} buffered transformed output from {source_node.label} "
                    f"with a {max_capture_mb} MB capture ceiling."
                ),
                preview_text=preview_text,
                preview_bytes=preview_bytes,
                captured_bytes=captured_bytes,
                max_capture_bytes=max_capture_bytes,
                truncated=captured_bytes > preview_bytes,
                approx_records=max(1, captured_bytes // 512),
            )
        )

    return cached_outputs


def _select_run_units(
    document: NoodlePipelineDocument,
    orchestration_mode: DesignerOrchestrationMode,
    test_node_id: str | None,
) -> list[tuple[str, str]]:
    if orchestration_mode == "plan" and document.orchestrator_plan and document.orchestrator_plan.tasks:
        plan_units = [(task.node_id or task.id, task.name) for task in document.orchestrator_plan.tasks]
        if test_node_id:
            filtered = [unit for unit in plan_units if unit[0] == test_node_id]
            if filtered:
                return filtered
        return plan_units

    node_units = [(node.id, node.label) for node in document.nodes]
    if test_node_id:
        filtered = [unit for unit in node_units if unit[0] == test_node_id]
        if not filtered:
            raise ValueError(f"Unknown test node id '{test_node_id}'.")
        return filtered
    return node_units


class NoodlePipelineControlPlaneService:
    def __init__(
        self,
        repository: NoodlePipelineRepository | None = None,
        runtime: NoodlePipelineRuntimeService | None = None,
    ) -> None:
        self.repository = repository or NoodlePipelineRepository()
        self.runtime = runtime or NoodlePipelineRuntimeService()

    def list_pipelines(self) -> list[NoodlePipelineDocument]:
        return self.repository.list_pipelines()

    def get_pipeline(self, pipeline_id: str) -> NoodlePipelineDocument | None:
        return self.repository.get_pipeline(pipeline_id)

    def save_pipeline(self, document: NoodlePipelineDocument) -> NoodlePipelineDocument:
        normalized = document.model_copy(update={"saved_at": _utc_now()})
        return self.repository.save_pipeline(normalized)

    def create_run(self, pipeline_id: str, request: NoodlePipelineRunCreateRequest) -> NoodlePipelineRunResponse:
        existing = self.repository.get_pipeline(pipeline_id)

        if existing is None:
            if request.document is None:
                raise KeyError(pipeline_id)
            existing = self.save_pipeline(request.document)
        elif request.document is not None:
            existing = self.save_pipeline(request.document.model_copy(update={"id": pipeline_id}))

        run_started_at = _utc_now()
        orchestration_mode = request.orchestration_mode or existing.schedule.orchestration_mode
        if_condition = request.if_condition if request.if_condition is not None else existing.schedule.if_condition
        if_passed, if_evaluation = _evaluate_if_condition(if_condition)
        conditional_block = request.trigger == "if" and not if_passed
        blocking_issue = existing.status != "published"
        execution_units = _select_run_units(existing, orchestration_mode, request.test_node_id)
        task_runs = []
        for index, (unit_id, unit_label) in enumerate(execution_units):
            if blocking_issue:
                state = "failed" if index == 0 else "skipped"
            elif conditional_block:
                state = "skipped"
            else:
                state = "running" if index == 0 else "queued"
            task_runs.append(
                NoodleDesignerRunTask(
                    id=f"task-run-{uuid4().hex[:10]}",
                    node_id=unit_id,
                    node_label=unit_label,
                    state=state,
                    started_at=run_started_at if index == 0 and not conditional_block else None,
                    finished_at=run_started_at if blocking_issue and index == 0 else run_started_at if conditional_block else None,
                )
            )

        run_label = (
            f"{_titleize(request.trigger)} test run"
            if request.test_node_id
            else f"{_titleize(request.trigger)} Soup Scheduler {orchestration_mode} run"
        )
        run_id = f"run-{uuid4().hex[:10]}"
        run_status = "failed" if blocking_issue else "cancelled" if conditional_block else "running"
        transformation_logs = _build_transformation_logs(existing.transformations, request.test_node_id)
        cached_outputs = _build_cached_outputs(existing, request.test_node_id)
        cached_output_logs = [
            _run_log(
                "info",
                (
                    f"Cache node '{item.node_label}' buffered {item.captured_bytes} bytes "
                    f"from {item.source_node_label or item.source_node_id} for preview."
                ),
                item.node_id,
            )
            for item in cached_outputs
        ]
        runtime_result = (
            self.runtime.execute(existing, run_id, run_started_at, _run_log, request.test_node_id)
            if not blocking_issue and not conditional_block
            else None
        )
        if runtime_result and runtime_result.executed:
            run_status = runtime_result.run_status or "success"
            cached_outputs = runtime_result.cached_outputs
            cached_output_logs = runtime_result.logs
            task_runs = [
                task.model_copy(
                    update={
                        "state": runtime_result.task_states.get(task.node_id, "success"),
                        "started_at": task.started_at or run_started_at,
                        "finished_at": run_started_at,
                    }
                )
                for task in task_runs
            ]
        run = NoodleDesignerRun(
            id=run_id,
            label=run_label,
            orchestrator="Soup Scheduler / Apache Airflow",
            status=run_status,
            trigger=request.trigger,
            orchestration_mode=orchestration_mode,
            started_at=run_started_at,
            finished_at=run_started_at if run_status in {"failed", "cancelled", "success"} else None,
            task_runs=task_runs,
            logs=(
                [
                    _run_log("log", "Soup Scheduler orchestrated this run from the versioned JSON pipeline spec."),
                    _run_log("info", f"Run started for pipeline version {existing.version} using {orchestration_mode} mode."),
                    _run_log("info", "Run logs and transformation traces were persisted to the PostgreSQL-backed control plane."),
                    _run_log("info", f"If trigger evaluation: {if_evaluation}.")
                    if request.trigger == "if"
                    else _run_log("log", "Run trigger does not require conditional evaluation."),
                ]
                + transformation_logs
                + cached_output_logs
                + (
                    [
                        _run_log(
                            "info",
                            (
                                f"Deployment contract points to {existing.deployment.repository.provider} repo "
                                f"'{existing.deployment.repository.repository or existing.deployment.repository.connection_id or 'unconfigured'}' "
                                f"branch '{existing.deployment.repository.branch}' for "
                                f"{existing.deployment.deploy_target}."
                            ),
                        )
                    ]
                    if existing.deployment.enabled
                    else []
                )
                + [
                    _run_log(
                        "warn",
                        "Run stopped because only published pipeline versions can execute."
                        if blocking_issue
                    else "Run paused because the IF condition did not pass."
                    if conditional_block
                    else "Run completed and dumped output artifacts from configured source connections."
                    if runtime_result and runtime_result.executed
                    else "Downstream tasks are waiting for upstream success before scheduling.",
                    )
                ]
            ),
            cached_outputs=cached_outputs,
        )

        next_document = existing.model_copy(update={"runs": [run, *existing.runs], "saved_at": _utc_now()})
        saved = self.repository.save_pipeline(next_document)
        return NoodlePipelineRunResponse(pipeline=saved, run=run)


@lru_cache(maxsize=1)
def get_noodle_pipeline_control_plane() -> NoodlePipelineControlPlaneService:
    return NoodlePipelineControlPlaneService()
