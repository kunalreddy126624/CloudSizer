from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from app.noodle.repository import NoodleBatchRecordStats, NoodlePipelineRepository
from app.noodle.runtime import (
    SNOWFLAKE_PLUGIN_NAMES,
    SOURCE_CONNECTION_PARAM_KEYS,
    SINK_CONNECTION_PARAM_KEYS,
    NoodlePipelineRuntimeService,
)
from app.noodle.schemas import (
    NoodleDesignerBatchResumeToken,
    NoodleDesignerBatchSession,
    NoodleDesignerBatchSessionAttempt,
    NoodleDesignerCachedOutput,
    NoodleDesignerConnectionRef,
    NoodleDesignerLineageRecord,
    NoodleDesignerNode,
    NoodleDesignerRepairIssue,
    NoodleDesignerRepairPlan,
    NoodlePipelineBatchResumeRequest,
    NoodlePipelineBatchResumeResponse,
    NoodleDesignerSinkBinding,
    DesignerRepairScope,
    DesignerRepairMode,
    DesignerOrchestrationMode,
    NoodleDesignerRun,
    NoodleDesignerRunLog,
    NoodleDesignerRunTask,
    NoodleDesignerTransformation,
    NoodlePipelineDocument,
    NoodlePipelineRepairRunRequest,
    NoodlePipelineRunCreateRequest,
    NoodlePipelineRunResponse,
)

CACHE_CAPTURE_LIMIT_BYTES = 30 * 1024 * 1024
CACHE_PREVIEW_LIMIT_BYTES = 256 * 1024
CACHE_OBSERVABLE_UPSTREAM_KINDS = {"transform", "quality", "feature", "serve"}
EXACT_WRITE_HINTS = {"transactional", "idempotent", "merge", "upsert", "overwrite_idempotent"}
BEST_EFFORT_WRITE_HINTS = {"append", "overwrite", "truncate_insert", "replace"}
UNSAFE_WRITE_HINTS = {"external_side_effect", "api_call", "email", "webhook"}


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


def _connection_param_map(connection: NoodleDesignerConnectionRef | None) -> dict[str, str]:
    if connection is None:
        return {}
    return {
        param.key.strip().lower(): param.value.strip()
        for param in connection.params
        if param.key.strip() and param.value is not None
    }


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


def _build_upstream_map(document: NoodlePipelineDocument) -> dict[str, list[str]]:
    upstream: dict[str, list[str]] = {}
    for edge in document.edges:
        upstream.setdefault(edge.target, []).append(edge.source)
    return upstream


def _collect_ancestor_ids(node_id: str, upstream_map: dict[str, list[str]]) -> set[str]:
    visited: set[str] = set()
    stack = list(upstream_map.get(node_id, []))
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        stack.extend(upstream_map.get(current, []))
    return visited


def _resolve_source_connection(
    document: NoodlePipelineDocument,
    source_node: NoodleDesignerNode,
) -> NoodleDesignerConnectionRef | None:
    params = _node_param_map(source_node)
    ref_value = next((params[key] for key in SOURCE_CONNECTION_PARAM_KEYS if key in params), None)
    if ref_value:
        for connection in document.connection_refs:
            if ref_value in {connection.id, connection.name, connection.auth_ref}:
                return connection
    if len(document.connection_refs) == 1:
        return document.connection_refs[0]
    return None


def _resolve_sink_connection(
    document: NoodlePipelineDocument,
    sink_node: NoodleDesignerNode,
) -> NoodleDesignerConnectionRef | None:
    params = _node_param_map(sink_node)
    ref_value = next((params[key] for key in SINK_CONNECTION_PARAM_KEYS if key in params), None)
    if ref_value:
        for connection in document.connection_refs:
            if ref_value in {connection.id, connection.name, connection.auth_ref}:
                return connection
    snowflake_connections = [
        connection
        for connection in document.connection_refs
        if connection.plugin.strip().lower() in SNOWFLAKE_PLUGIN_NAMES
    ]
    if len(snowflake_connections) == 1:
        return snowflake_connections[0]
    return None


def _output_asset_id(document: NoodlePipelineDocument, sink_node: NoodleDesignerNode) -> str:
    params = _node_param_map(sink_node)
    table = next(
        (
            params[key]
            for key in (
                "table",
                "target_table",
                "snowflake_table",
                "output_path",
                "dump_path",
                "target_path",
            )
            if key in params and params[key]
        ),
        None,
    )
    if table:
        return table
    return f"asset://{document.id}/{sink_node.id}"


def _evaluate_sink_support(
    sink_node: NoodleDesignerNode,
    connection: NoodleDesignerConnectionRef | None,
) -> tuple[str, str, str, str]:
    params = _node_param_map(sink_node)
    connection_params = _connection_param_map(connection)
    hints = [
        params.get("write_semantics", "").strip().lower(),
        params.get("repair_semantics", "").strip().lower(),
        params.get("write_mode", "").strip().lower(),
        params.get("idempotency_strategy", "").strip().lower(),
        connection_params.get("write_semantics", "").strip().lower(),
    ]
    plugin = connection.plugin.strip().lower() if connection is not None else "local-file-sink"
    configured_keys = [
        params.get("idempotency_key", "").strip(),
        params.get("merge_key", "").strip(),
        params.get("primary_key", "").strip(),
        connection_params.get("idempotency_key", "").strip(),
    ]
    if any(hint in EXACT_WRITE_HINTS for hint in hints) or any(configured_keys):
        idempotency_strategy = next(
            (
                hint
                for hint in hints
                if hint in EXACT_WRITE_HINTS or hint in {"merge", "upsert"}
            ),
            "idempotent-key",
        )
        transaction_strategy = "snowflake-transaction" if plugin in SNOWFLAKE_PLUGIN_NAMES else "plugin-managed-commit"
        return (
            "exact",
            idempotency_strategy,
            transaction_strategy,
            "Sink declares idempotent or transactional write semantics.",
        )
    if any(hint in UNSAFE_WRITE_HINTS for hint in hints):
        return (
            "unsafe",
            "none",
            "none",
            "Sink declares external side effects that cannot be repaired exactly.",
        )
    return (
        "best_effort",
        next((hint for hint in hints if hint in BEST_EFFORT_WRITE_HINTS), "append"),
        "single-commit",
        "Sink can be rerun, but exactness is not proven by plugin metadata.",
    )


def _reachable_sink_nodes(
    document: NoodlePipelineDocument,
    task_id: str,
    orchestration_mode: DesignerOrchestrationMode,
) -> list[NoodleDesignerNode]:
    if orchestration_mode == "plan":
        return []
    node_by_id = {node.id: node for node in document.nodes}
    downstream_map = _build_downstream_map(document, orchestration_mode)
    reachable = _collect_downstream_closure({task_id}, downstream_map)
    sinks = [
        node_by_id[node_id]
        for node_id in reachable
        if node_id in node_by_id and node_by_id[node_id].kind == "cache"
    ]
    return sinks


def _build_sink_bindings(
    document: NoodlePipelineDocument,
    orchestration_mode: DesignerOrchestrationMode,
    task_ids: list[str],
    root_run_id: str,
    attempt_id: str,
) -> list[NoodleDesignerSinkBinding]:
    node_by_id = {node.id: node for node in document.nodes}
    bindings: list[NoodleDesignerSinkBinding] = []
    seen: set[tuple[str, str]] = set()
    for task_id in task_ids:
        task_node = node_by_id.get(task_id)
        if task_node is None:
            continue
        for sink_node in _reachable_sink_nodes(document, task_id, orchestration_mode):
            key = (task_id, sink_node.id)
            if key in seen:
                continue
            seen.add(key)
            connection = _resolve_sink_connection(document, sink_node)
            support_level, idempotency_strategy, transaction_strategy, notes = _evaluate_sink_support(sink_node, connection)
            output_asset_id = _output_asset_id(document, sink_node)
            bindings.append(
                NoodleDesignerSinkBinding(
                    task_id=task_id,
                    task_label=task_node.label,
                    sink_node_id=sink_node.id,
                    sink_node_label=sink_node.label,
                    sink_plugin=connection.plugin if connection is not None else "local-file-sink",
                    support_level=support_level,
                    idempotency_strategy=idempotency_strategy,
                    transaction_strategy=transaction_strategy,
                    output_asset_id=output_asset_id,
                    output_version=f"v{document.version}:{root_run_id}:{attempt_id}:{sink_node.id}",
                    idempotency_key=(
                        f"{root_run_id}:{attempt_id}:{task_id}:{sink_node.id}"
                        if support_level == "exact"
                        else None
                    ),
                    notes=notes,
                )
            )
    return bindings


def _build_lineage_records(
    document: NoodlePipelineDocument,
    orchestration_mode: DesignerOrchestrationMode,
    task_ids: list[str],
    sink_bindings: list[NoodleDesignerSinkBinding],
) -> list[NoodleDesignerLineageRecord]:
    if orchestration_mode == "plan":
        return []
    node_by_id = {node.id: node for node in document.nodes}
    upstream_map = _build_upstream_map(document)
    bindings_by_task: dict[str, list[NoodleDesignerSinkBinding]] = {}
    for binding in sink_bindings:
        bindings_by_task.setdefault(binding.task_id, []).append(binding)

    records: list[NoodleDesignerLineageRecord] = []
    for task_id in task_ids:
        task_node = node_by_id.get(task_id)
        if task_node is None:
            continue
        input_assets: list[str] = []
        for ancestor_id in sorted(_collect_ancestor_ids(task_id, upstream_map)):
            ancestor = node_by_id.get(ancestor_id)
            if ancestor is None:
                continue
            if ancestor.kind == "source":
                connection = _resolve_source_connection(document, ancestor)
                input_assets.append(
                    connection.name if connection is not None else f"source://{document.id}/{ancestor.id}"
                )
        task_bindings = bindings_by_task.get(task_id, [])
        output_assets = [binding.output_asset_id for binding in task_bindings]
        records.append(
            NoodleDesignerLineageRecord(
                task_id=task_id,
                task_label=task_node.label,
                input_assets=input_assets,
                output_assets=output_assets,
                output_version=task_bindings[0].output_version if task_bindings else None,
            )
        )
    return records


def _schema_fingerprint(document: NoodlePipelineDocument, node_id: str | None = None) -> str:
    scoped_schemas = [
        schema.model_dump(mode="json")
        for schema in document.schemas
        if node_id is None or schema.source_connection_id in {None, node_id}
    ]
    payload = json.dumps(scoped_schemas or [{"document_version": document.version, "node_id": node_id}], sort_keys=True)
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]}"


def _batch_source_nodes(
    document: NoodlePipelineDocument,
    execution_unit_ids: set[str] | None = None,
) -> list[NoodleDesignerNode]:
    sources = [node for node in document.nodes if node.kind == "source"]
    if execution_unit_ids is None:
        return sources
    return [node for node in sources if node.id in execution_unit_ids]


def _batch_expected_count(source_node: NoodleDesignerNode) -> int:
    return _coerce_positive_int(_node_param_map(source_node).get("expected_count"), 1000)


def _batch_fail_after_offset(source_node: NoodleDesignerNode, expected_count: int) -> int | None:
    params = _node_param_map(source_node)
    raw = params.get("fail_after_offset")
    if raw is None or not raw.strip():
        return None
    offset = _coerce_positive_int(raw, expected_count)
    if offset >= expected_count:
        return None
    return max(1, offset)


def _batch_session_id(source_node: NoodleDesignerNode, source_batch_id: str) -> str:
    normalized = "".join(character if character.isalnum() else "-" for character in source_batch_id).strip("-").lower()
    normalized = normalized or source_node.id.lower()
    return f"batch-session-{source_node.id}-{normalized}"


def _merge_batch_sessions(
    existing_sessions: list[NoodleDesignerBatchSession],
    updated_sessions: list[NoodleDesignerBatchSession],
) -> list[NoodleDesignerBatchSession]:
    by_id = {session.id: session for session in existing_sessions}
    for session in updated_sessions:
        by_id[session.id] = session
    return sorted(by_id.values(), key=lambda item: (item.last_run_id or "", item.source_batch_id), reverse=True)


def _related_run_ids(current: NoodleDesignerBatchSession | None, run_id: str) -> list[str]:
    existing = current.related_run_ids[:] if current is not None else []
    if run_id not in existing:
        existing.append(run_id)
    return existing


def _batch_session_exactness_summary(
    sink_bindings: list[NoodleDesignerSinkBinding],
) -> tuple[bool, str]:
    if not sink_bindings:
        return False, "No reachable sink bindings were recorded for this batch source."
    if all(binding.support_level == "exact" for binding in sink_bindings):
        return True, "All reachable sinks declare idempotent or transactional semantics."
    if any(binding.support_level == "unsafe" for binding in sink_bindings):
        return False, "One or more reachable sinks declare unsafe external side effects."
    return False, "At least one reachable sink is only best-effort, so exact resume is blocked."


def _synthesize_batch_records(
    source_node: NoodleDesignerNode,
    source_batch_id: str,
    source_system: str,
    start_offset: int,
    end_offset: int,
) -> list[tuple[int, dict[str, object]]]:
    records: list[tuple[int, dict[str, object]]] = []
    for record_seq in range(start_offset, end_offset + 1):
        payload = {
            "source_batch_id": source_batch_id,
            "source_system": source_system,
            "source_node_id": source_node.id,
            "source_node_label": source_node.label,
            "record_seq": record_seq,
            "business_key": f"{source_batch_id}-{record_seq:05d}",
            "payload": {
                "record_id": record_seq,
                "normalized_value": f"{source_node.id}-value-{record_seq:05d}",
                "quality_state": "accepted" if record_seq % 5 else "needs_review",
            },
        }
        records.append((record_seq, payload))
    return records


def _next_offset_from_stats(stats: NoodleBatchRecordStats, expected_count: int) -> int:
    if stats.max_contiguous_staged_offset >= expected_count:
        return expected_count + 1
    return max(1, stats.max_contiguous_staged_offset + 1)


def _apply_batch_record_stats(
    batch_session: NoodleDesignerBatchSession,
    stats: NoodleBatchRecordStats,
    expected_count: int,
    status: str,
    committed_version: str | None,
    run_id: str,
    root_run_id: str,
    exact_supported: bool,
    exact_support_summary: str,
    last_committed_at: str | None,
) -> NoodleDesignerBatchSession:
    next_offset = _next_offset_from_stats(stats, expected_count)
    return batch_session.model_copy(
        update={
            "staged_count": stats.staged_count,
            "committed_count": stats.committed_count,
            "next_offset": next_offset,
            "max_contiguous_committed_offset": stats.max_contiguous_staged_offset,
            "status": status,
            "exact_supported": exact_supported,
            "exact_support_summary": exact_support_summary,
            "last_run_id": run_id,
            "root_run_id": root_run_id,
            "committed_version": committed_version,
            "resume_token": batch_session.resume_token.model_copy(
                update={
                    "next_offset": next_offset,
                    "last_committed_at": last_committed_at,
                }
            ),
        }
    )


def _build_batch_sessions_for_run(
    document: NoodlePipelineDocument,
    orchestration_mode: DesignerOrchestrationMode,
    run_id: str,
    root_run_id: str,
    attempt_id: str,
    run_started_at: str,
    run_status: str,
    execution_unit_ids: set[str],
    existing_sessions: list[NoodleDesignerBatchSession],
    include_partial_failure: bool,
) -> list[NoodleDesignerBatchSession]:
    sessions: list[NoodleDesignerBatchSession] = []
    for source_node in _batch_source_nodes(document, execution_unit_ids):
        params = _node_param_map(source_node)
        expected_count = _batch_expected_count(source_node)
        fail_after_offset = _batch_fail_after_offset(source_node, expected_count) if include_partial_failure else None
        source_batch_id = params.get("source_batch_id", f"{root_run_id}-{source_node.id}-batch")
        existing = next((session for session in existing_sessions if session.id == _batch_session_id(source_node, source_batch_id)), None)
        sink_bindings = _build_sink_bindings(document, orchestration_mode, [source_node.id], root_run_id, attempt_id)
        exact_supported, exact_support_summary = _batch_session_exactness_summary(sink_bindings)
        schema_fingerprint = _schema_fingerprint(document, source_node.id)

        if fail_after_offset is not None and run_status == "failed":
            staged_count = fail_after_offset
            committed_count = fail_after_offset
            next_offset = min(expected_count, fail_after_offset) + 1
            status = "partial"
            committed_version = None
        elif run_status == "success":
            staged_count = expected_count
            committed_count = expected_count
            next_offset = expected_count + 1
            status = "committed"
            committed_version = f"v{document.version}:{root_run_id}:{attempt_id}:{source_node.id}"
        else:
            staged_count = 0
            committed_count = 0
            next_offset = 1
            status = "failed" if run_status == "failed" else "staging"
            committed_version = None

        attempt = NoodleDesignerBatchSessionAttempt(
            id=f"{_batch_session_id(source_node, source_batch_id)}-attempt-{len(existing.attempts) + 1 if existing else 1}",
            run_id=run_id,
            kind="run",
            mode="best_effort" if not exact_supported else "exact",
            status=status,
            from_offset=1,
            started_at=run_started_at,
            finished_at=run_started_at if status in {"partial", "committed", "failed", "blocked"} else None,
            staged_count=staged_count,
            next_offset=next_offset,
            committed_version=committed_version,
            reason="Initial batch staging attempt.",
        )
        resume_token = NoodleDesignerBatchResumeToken(
            source_system=params.get("source_system", source_node.label),
            source_batch_id=source_batch_id,
            expected_count=expected_count,
            next_offset=next_offset,
            ordering_key=params.get("ordering_key", "record_seq"),
            schema_fingerprint=schema_fingerprint,
            payload_fingerprint_mode=params.get("payload_fingerprint_mode", "optional"),
            last_committed_at=run_started_at if committed_version else None,
        )
        sessions.append(
            NoodleDesignerBatchSession(
                id=_batch_session_id(source_node, source_batch_id),
                source_node_id=source_node.id,
                source_node_label=source_node.label,
                source_system=params.get("source_system", source_node.label),
                source_batch_id=source_batch_id,
                expected_count=expected_count,
                staged_count=staged_count,
                committed_count=committed_count,
                next_offset=next_offset,
                max_contiguous_committed_offset=committed_count,
                status=status,
                resume_token=resume_token,
                exact_supported=exact_supported,
                exact_support_summary=exact_support_summary,
                schema_fingerprint=schema_fingerprint,
                last_run_id=run_id,
                root_run_id=root_run_id,
                committed_version=committed_version,
                related_run_ids=_related_run_ids(existing, run_id),
                attempts=[*(existing.attempts if existing else []), attempt],
            )
        )
    return sessions


def _build_downstream_map(
    document: NoodlePipelineDocument,
    orchestration_mode: DesignerOrchestrationMode,
) -> dict[str, set[str]]:
    downstream: dict[str, set[str]] = {}
    if orchestration_mode == "plan" and document.orchestrator_plan and document.orchestrator_plan.tasks:
        for task in document.orchestrator_plan.tasks:
            unit_id = task.node_id or task.id
            downstream.setdefault(unit_id, set())
            for dependency in task.depends_on:
                downstream.setdefault(dependency, set()).add(unit_id)
        return downstream

    for edge in document.edges:
        downstream.setdefault(edge.source, set()).add(edge.target)
        downstream.setdefault(edge.target, set())
    return downstream


def _collect_downstream_closure(seed_ids: set[str], downstream_map: dict[str, set[str]]) -> set[str]:
    closure = set(seed_ids)
    stack = list(seed_ids)
    while stack:
        current = stack.pop()
        for child_id in downstream_map.get(current, set()):
            if child_id in closure:
                continue
            closure.add(child_id)
            stack.append(child_id)
    return closure


def _is_terminal_run_status(status: str) -> bool:
    return status in {"success", "failed", "cancelled"}


def _select_repair_unit_ids(
    document: NoodlePipelineDocument,
    base_run: NoodleDesignerRun,
    orchestration_mode: DesignerOrchestrationMode,
    repair_scope: DesignerRepairScope,
    requested_task_ids: list[str],
) -> set[str]:
    available_unit_ids = {unit_id for unit_id, _ in _select_run_units(document, orchestration_mode, None)}
    failed_task_ids = {
        task.node_id
        for task in base_run.task_runs
        if task.node_id in available_unit_ids and task.state in {"failed", "skipped", "cancelled"}
    }

    if repair_scope.startswith("selected"):
        rerun_ids = {task_id for task_id in requested_task_ids if task_id in available_unit_ids}
        if not rerun_ids:
            raise ValueError("Select at least one task to repair.")
        missing_task_ids = sorted(set(requested_task_ids) - available_unit_ids)
        if missing_task_ids:
            raise ValueError(f"Unknown task ids for repair: {', '.join(missing_task_ids)}.")
    else:
        rerun_ids = failed_task_ids
        if not rerun_ids:
            raise ValueError("The selected run has no failed or skipped tasks to repair.")

    if repair_scope.endswith("dependents"):
        rerun_ids = _collect_downstream_closure(rerun_ids, _build_downstream_map(document, orchestration_mode))

    return rerun_ids


def _build_repair_plan(
    document: NoodlePipelineDocument,
    base_run: NoodleDesignerRun,
    orchestration_mode: DesignerOrchestrationMode,
    repair_scope: DesignerRepairScope,
    repair_mode: DesignerRepairMode,
    rerun_order: list[str],
    reused_ids: list[str],
    root_run_id: str,
    attempt_id: str,
    blocking_issue: bool,
) -> NoodleDesignerRepairPlan:
    sink_bindings = _build_sink_bindings(document, orchestration_mode, rerun_order, root_run_id, attempt_id)
    validation_issues: list[NoodleDesignerRepairIssue] = []
    if blocking_issue:
        validation_issues.append(
            NoodleDesignerRepairIssue(
                severity="error",
                code="document_not_published",
                message="Only published pipeline versions can execute repair attempts.",
            )
        )
    for binding in sink_bindings:
        if repair_mode == "exact" and binding.support_level != "exact":
            validation_issues.append(
                NoodleDesignerRepairIssue(
                    severity="error",
                    code="sink_not_exact",
                    message=(
                        f"Task '{binding.task_label}' reaches sink '{binding.sink_node_label}' via "
                        f"{binding.sink_plugin}, but exact repair is not proven for that plugin contract."
                    ),
                    task_id=binding.task_id,
                )
            )
        elif binding.support_level == "best_effort":
            validation_issues.append(
                NoodleDesignerRepairIssue(
                    severity="warn",
                    code="sink_best_effort",
                    message=(
                        f"Task '{binding.task_label}' will reuse best-effort sink semantics at "
                        f"'{binding.sink_node_label}'."
                    ),
                    task_id=binding.task_id,
                )
            )
        elif binding.support_level == "unsafe":
            validation_issues.append(
                NoodleDesignerRepairIssue(
                    severity="error" if repair_mode == "exact" else "warn",
                    code="sink_unsafe",
                    message=(
                        f"Task '{binding.task_label}' targets sink '{binding.sink_node_label}' with "
                        "unsafe external side effects."
                    ),
                    task_id=binding.task_id,
                )
            )

    outcome = "exact"
    if repair_mode == "best_effort":
        outcome = "best_effort"
    elif any(issue.severity == "error" for issue in validation_issues):
        outcome = "blocked"

    downstream_ids = [
        task_id
        for task_id in rerun_order
        if task_id not in {
            task.node_id
            for task in base_run.task_runs
            if task.state in {"failed", "skipped", "cancelled"}
        }
    ]
    return NoodleDesignerRepairPlan(
        attempt_id=attempt_id,
        base_run_id=base_run.id,
        root_run_id=root_run_id,
        document_version=document.version,
        mode=repair_mode,
        outcome=outcome,
        scope=repair_scope,
        rerun_task_ids=rerun_order,
        reused_task_ids=reused_ids,
        downstream_task_ids=downstream_ids,
        validation_issues=validation_issues,
    )


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

    def _load_pipeline_for_run(
        self,
        pipeline_id: str,
        document: NoodlePipelineDocument | None,
    ) -> NoodlePipelineDocument:
        existing = self.repository.get_pipeline(pipeline_id)
        if existing is None:
            if document is None:
                raise KeyError(pipeline_id)
            return self.save_pipeline(document)
        if document is not None:
            return self.save_pipeline(document.model_copy(update={"id": pipeline_id}))
        return existing

    def _persist_run(
        self,
        pipeline: NoodlePipelineDocument,
        run: NoodleDesignerRun,
        batch_sessions: list[NoodleDesignerBatchSession] | None = None,
    ) -> NoodlePipelineRunResponse:
        next_document = pipeline.model_copy(
            update={
                "runs": [run, *pipeline.runs],
                "batch_sessions": batch_sessions if batch_sessions is not None else pipeline.batch_sessions,
                "saved_at": _utc_now(),
            }
        )
        saved = self.repository.save_pipeline(next_document)
        return NoodlePipelineRunResponse(pipeline=saved, run=run)

    def _materialize_batch_sessions_for_run(
        self,
        pipeline: NoodlePipelineDocument,
        orchestration_mode: DesignerOrchestrationMode,
        run_id: str,
        root_run_id: str,
        attempt_id: str,
        run_started_at: str,
        run_status: str,
        execution_unit_ids: set[str],
        existing_sessions: list[NoodleDesignerBatchSession],
        include_partial_failure: bool,
    ) -> list[NoodleDesignerBatchSession]:
        seeded_sessions = _build_batch_sessions_for_run(
            pipeline,
            orchestration_mode,
            run_id,
            root_run_id,
            attempt_id,
            run_started_at,
            run_status,
            execution_unit_ids,
            existing_sessions,
            include_partial_failure,
        )
        node_by_id = {node.id: node for node in pipeline.nodes}
        materialized: list[NoodleDesignerBatchSession] = []
        for session in seeded_sessions:
            source_node = node_by_id.get(session.source_node_id)
            if source_node is None:
                materialized.append(session)
                continue

            if run_status == "success":
                self.repository.stage_batch_records(
                    pipeline.id,
                    session.id,
                    source_node.id,
                    session.source_batch_id,
                    run_id,
                    _synthesize_batch_records(
                        source_node,
                        session.source_batch_id,
                        session.source_system,
                        1,
                        session.expected_count,
                    ),
                )
            elif run_status == "failed" and include_partial_failure:
                fail_after_offset = _batch_fail_after_offset(source_node, session.expected_count)
                if fail_after_offset is not None:
                    self.repository.stage_batch_records(
                        pipeline.id,
                        session.id,
                        source_node.id,
                        session.source_batch_id,
                        run_id,
                        _synthesize_batch_records(
                            source_node,
                            session.source_batch_id,
                            session.source_system,
                            1,
                            fail_after_offset,
                        ),
                    )

            committed_version = session.committed_version
            if run_status == "success" and committed_version:
                self.repository.mark_batch_records_committed(session.id, committed_version, run_id)

            stats = self.repository.get_batch_record_stats(session.id)
            last_committed_at = run_started_at if run_status == "success" and committed_version else session.resume_token.last_committed_at
            updated = _apply_batch_record_stats(
                session,
                stats,
                session.expected_count,
                session.status,
                committed_version or stats.last_committed_version,
                run_id,
                root_run_id,
                session.exact_supported,
                session.exact_support_summary,
                last_committed_at,
            )
            if updated.attempts:
                latest_attempt = updated.attempts[-1].model_copy(
                    update={
                        "staged_count": updated.staged_count,
                        "next_offset": updated.next_offset,
                        "committed_version": updated.committed_version,
                    }
                )
                updated = updated.model_copy(update={"attempts": [*updated.attempts[:-1], latest_attempt]})
            materialized.append(updated)
        return materialized

    def create_run(self, pipeline_id: str, request: NoodlePipelineRunCreateRequest) -> NoodlePipelineRunResponse:
        existing = self._load_pipeline_for_run(pipeline_id, request.document)
        run_started_at = _utc_now()
        orchestration_mode = request.orchestration_mode or existing.schedule.orchestration_mode
        if_condition = request.if_condition if request.if_condition is not None else existing.schedule.if_condition
        if_passed, if_evaluation = _evaluate_if_condition(if_condition)
        conditional_block = request.trigger == "if" and not if_passed
        blocking_issue = existing.status != "published"
        execution_units = _select_run_units(existing, orchestration_mode, request.test_node_id)
        execution_unit_ids = {unit_id for unit_id, _ in execution_units}
        partial_source_ids = {
            source_node.id
            for source_node in _batch_source_nodes(existing, execution_unit_ids)
            if _batch_fail_after_offset(source_node, _batch_expected_count(source_node)) is not None
        }
        partial_batch_failure = bool(partial_source_ids) and not blocking_issue and not conditional_block
        task_runs = []
        for index, (unit_id, unit_label) in enumerate(execution_units):
            if blocking_issue:
                state = "failed" if index == 0 else "skipped"
            elif conditional_block:
                state = "skipped"
            elif partial_batch_failure and unit_id in partial_source_ids:
                state = "failed"
            elif partial_batch_failure:
                state = "skipped"
            else:
                state = "running" if index == 0 else "queued"
            task_runs.append(
                NoodleDesignerRunTask(
                    id=f"task-run-{uuid4().hex[:10]}",
                    node_id=unit_id,
                    node_label=unit_label,
                    state=state,
                    started_at=run_started_at if (index == 0 and not conditional_block) or (partial_batch_failure and unit_id in partial_source_ids) else None,
                    finished_at=run_started_at if blocking_issue and index == 0 else run_started_at if conditional_block or partial_batch_failure else None,
                )
            )

        run_label = (
            f"{_titleize(request.trigger)} test run"
            if request.test_node_id
            else f"{_titleize(request.trigger)} Soup Scheduler {orchestration_mode} run"
        )
        run_id = f"run-{uuid4().hex[:10]}"
        attempt_id = f"{run_id}:attempt-0"
        run_status = "failed" if blocking_issue or partial_batch_failure else "cancelled" if conditional_block else "running"
        transformation_logs = _build_transformation_logs(existing.transformations, request.test_node_id)
        cached_outputs = _build_cached_outputs(existing, request.test_node_id)
        executed_task_ids = [unit_id for unit_id, _ in execution_units]
        sink_bindings = _build_sink_bindings(existing, orchestration_mode, executed_task_ids, run_id, attempt_id)
        lineage_records = _build_lineage_records(existing, orchestration_mode, executed_task_ids, sink_bindings)
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
            if not blocking_issue and not conditional_block and not partial_batch_failure
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
        batch_sessions = _merge_batch_sessions(
            existing.batch_sessions,
            self._materialize_batch_sessions_for_run(
                existing,
                orchestration_mode,
                run_id,
                run_id,
                attempt_id,
                run_started_at,
                run_status,
                execution_unit_ids,
                existing.batch_sessions,
                partial_batch_failure,
            ),
        )
        batch_session_ids = [session.id for session in batch_sessions if session.last_run_id == run_id]
        run = NoodleDesignerRun(
            id=run_id,
            label=run_label,
            orchestrator="Soup Scheduler / Apache Airflow",
            status=run_status,
            trigger=request.trigger,
            orchestration_mode=orchestration_mode,
            started_at=run_started_at,
            finished_at=run_started_at if run_status in {"failed", "cancelled", "success"} else None,
            document_version=existing.version,
            root_run_id=run_id,
            repair_attempt=0,
            repair_attempt_id=attempt_id,
            batch_session_ids=batch_session_ids,
            task_runs=task_runs,
            logs=(
                [
                    _run_log("log", "Soup Scheduler orchestrated this run from the versioned JSON pipeline spec."),
                    _run_log("info", f"Run started for pipeline version {existing.version} using {orchestration_mode} mode."),
                    _run_log("info", "Run logs and transformation traces were persisted to the PostgreSQL-backed control plane."),
                    _run_log("info", f"Captured {len(lineage_records)} lineage records and {len(sink_bindings)} sink bindings for this run."),
                    _run_log("info", f"Tracked {len(batch_session_ids)} batch sessions for this run."),
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
                    else "Run stopped after partial batch staging. Resume the related batch session from the next offset."
                    if partial_batch_failure
                    else "Run paused because the IF condition did not pass."
                    if conditional_block
                    else "Run completed and dumped output artifacts from configured source connections."
                    if runtime_result and runtime_result.executed
                    else "Downstream tasks are waiting for upstream success before scheduling.",
                    )
                ]
            ),
            cached_outputs=cached_outputs,
            sink_bindings=sink_bindings,
            lineage_records=lineage_records,
        )
        return self._persist_run(existing, run, batch_sessions)

    def repair_run(
        self,
        pipeline_id: str,
        run_id: str,
        request: NoodlePipelineRepairRunRequest,
    ) -> NoodlePipelineRunResponse:
        existing = self._load_pipeline_for_run(pipeline_id, request.document)
        base_run = next((run for run in existing.runs if run.id == run_id), None)
        if base_run is None:
            raise KeyError(run_id)
        if not _is_terminal_run_status(base_run.status):
            raise ValueError("Repair runs are allowed only after the selected run reaches a terminal state.")

        run_started_at = _utc_now()
        orchestration_mode = request.orchestration_mode or base_run.orchestration_mode or existing.schedule.orchestration_mode
        rerun_ids = _select_repair_unit_ids(
            existing,
            base_run,
            orchestration_mode,
            request.repair_scope,
            request.task_ids,
        )
        execution_units = _select_run_units(existing, orchestration_mode, None)
        base_task_by_id = {task.node_id: task for task in base_run.task_runs}
        publish_blocking_issue = existing.status != "published"
        rerun_order = [unit_id for unit_id, _ in execution_units if unit_id in rerun_ids]
        reused_ids = [unit_id for unit_id, _ in execution_units if unit_id not in rerun_ids]

        task_runs: list[NoodleDesignerRunTask] = []
        for rerun_index, (unit_id, unit_label) in enumerate(execution_units):
            previous_task = base_task_by_id.get(unit_id)
            if unit_id not in rerun_ids:
                task_runs.append(
                    NoodleDesignerRunTask(
                        id=f"task-run-{uuid4().hex[:10]}",
                        node_id=unit_id,
                        node_label=unit_label,
                        state="reused",
                        started_at=previous_task.started_at if previous_task else None,
                        finished_at=previous_task.finished_at if previous_task else None,
                    )
                )
                continue

            current_rerun_index = rerun_order.index(unit_id)
            if publish_blocking_issue:
                state = "failed" if current_rerun_index == 0 else "skipped"
            else:
                state = "running" if current_rerun_index == 0 else "queued"
            task_runs.append(
                NoodleDesignerRunTask(
                    id=f"task-run-{uuid4().hex[:10]}",
                    node_id=unit_id,
                    node_label=unit_label,
                    state=state,
                    started_at=run_started_at if state == "running" else None,
                    finished_at=run_started_at if state in {"failed", "skipped"} else None,
                )
            )

        root_run_id = base_run.root_run_id or base_run.id
        repair_attempt = (
            max(
                (
                    run.repair_attempt or 0
                    for run in existing.runs
                    if (run.root_run_id or run.id) == root_run_id
                ),
                default=0,
            )
            + 1
        )
        repair_run_id = f"run-{uuid4().hex[:10]}"
        attempt_id = f"{root_run_id}:repair-{repair_attempt}"
        repair_plan = _build_repair_plan(
            existing,
            base_run,
            orchestration_mode,
            request.repair_scope,
            request.repair_mode,
            rerun_order,
            reused_ids,
            root_run_id,
            attempt_id,
            publish_blocking_issue,
        )
        sink_bindings = _build_sink_bindings(existing, orchestration_mode, rerun_order, root_run_id, attempt_id)
        lineage_records = _build_lineage_records(existing, orchestration_mode, rerun_order, sink_bindings)
        repair_blocked = repair_plan.outcome == "blocked"
        runtime_scope_node_id = rerun_order[0] if len(rerun_order) == 1 else None
        cached_outputs = _build_cached_outputs(existing, runtime_scope_node_id)
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
            self.runtime.execute(existing, repair_run_id, run_started_at, _run_log, runtime_scope_node_id)
            if not publish_blocking_issue and not repair_blocked
            else None
        )
        run_status = "failed" if publish_blocking_issue or repair_blocked else "running"
        if runtime_result and runtime_result.executed:
            run_status = runtime_result.run_status or "success"
            cached_outputs = runtime_result.cached_outputs
            cached_output_logs = runtime_result.logs
            task_runs = [
                task.model_copy(
                    update={
                        "state": (
                            runtime_result.task_states.get(task.node_id, "success")
                            if task.node_id in rerun_ids
                            else "reused"
                        ),
                        "started_at": task.started_at or (run_started_at if task.node_id in rerun_ids else task.started_at),
                        "finished_at": run_started_at if task.node_id in rerun_ids else task.finished_at,
                    }
                )
                for task in task_runs
            ]
        elif repair_blocked:
            rerun_index = {task_id: index for index, task_id in enumerate(rerun_order)}
            task_runs = [
                task.model_copy(
                    update={
                        "state": (
                            "reused"
                            if task.node_id not in rerun_ids
                            else "failed"
                            if rerun_index.get(task.node_id, 0) == 0
                            else "skipped"
                        ),
                        "finished_at": run_started_at if task.node_id in rerun_ids else task.finished_at,
                    }
                )
                for task in task_runs
            ]
        elif not publish_blocking_issue:
            run_status = "success"
            task_runs = [
                task.model_copy(
                    update={
                        "state": "success" if task.node_id in rerun_ids else "reused",
                        "started_at": task.started_at or (run_started_at if task.node_id in rerun_ids else task.started_at),
                        "finished_at": run_started_at if task.node_id in rerun_ids else task.finished_at,
                    }
                )
                for task in task_runs
            ]

        run = NoodleDesignerRun(
            id=repair_run_id,
            label=f"Repair {repair_attempt} for {base_run.label}",
            orchestrator="Soup Scheduler / Apache Airflow",
            status=run_status,
            trigger="manual",
            orchestration_mode=orchestration_mode,
            started_at=run_started_at,
            finished_at=run_started_at if run_status in {"failed", "cancelled", "success"} else None,
            document_version=existing.version,
            root_run_id=root_run_id,
            repair_of_run_id=base_run.id,
            repair_attempt=repair_attempt,
            repair_attempt_id=attempt_id,
            repair_scope=request.repair_scope,
            repair_mode=request.repair_mode,
            repair_outcome=repair_plan.outcome,
            repair_reason=request.reason.strip() or None,
            repaired_task_ids=rerun_order,
            reused_task_ids=reused_ids,
            repair_plan=repair_plan,
            batch_session_ids=base_run.batch_session_ids,
            task_runs=task_runs,
            logs=[
                _run_log("log", f"Repair run created from {base_run.label}."),
                _run_log("info", f"Repair scope resolved to {len(rerun_order)} rerun tasks and {len(reused_ids)} reused tasks."),
                _run_log("info", f"Repair policy: {request.repair_scope.replace('_', ' ')} in {request.repair_mode.replace('_', ' ')} mode."),
                _run_log("info", f"Repair attempt {attempt_id} captured {len(lineage_records)} lineage records and {len(sink_bindings)} sink bindings."),
                _run_log("info", f"Operator reason: {request.reason.strip()}.") if request.reason.strip() else _run_log("log", "No repair reason was provided."),
                _run_log("warn", "Repair stopped because only published pipeline versions can execute.")
                if publish_blocking_issue
                else _run_log("warn", "Exact repair was blocked because one or more sink contracts are not idempotent or transactional.")
                if repair_blocked
                else _run_log("info", "Repair reran the selected task subset and preserved prior successful work where possible."),
                *[
                    _run_log(issue.severity if issue.severity != "error" else "warn", issue.message, issue.task_id)
                    for issue in repair_plan.validation_issues
                ],
                *cached_output_logs,
            ],
            cached_outputs=cached_outputs,
            sink_bindings=sink_bindings,
            lineage_records=lineage_records,
        )
        return self._persist_run(existing, run, existing.batch_sessions)

    def resume_batch_session(
        self,
        pipeline_id: str,
        batch_session_id: str,
        request: NoodlePipelineBatchResumeRequest,
    ) -> NoodlePipelineBatchResumeResponse:
        existing = self._load_pipeline_for_run(pipeline_id, request.document)
        batch_session = next((session for session in existing.batch_sessions if session.id == batch_session_id), None)
        if batch_session is None:
            raise KeyError(batch_session_id)
        if batch_session.status == "committed":
            raise ValueError("The selected batch session is already committed.")

        resume_from = request.from_offset or batch_session.next_offset
        if resume_from < 1 or resume_from > batch_session.expected_count + 1:
            raise ValueError("Resume offset must be within the batch bounds.")
        if resume_from < batch_session.max_contiguous_committed_offset + 1:
            raise ValueError("Resume offset cannot move behind the committed boundary.")
        if resume_from > batch_session.next_offset:
            raise ValueError("Resume offset cannot skip unstaged records ahead of the current checkpoint.")

        base_run = next((run for run in existing.runs if run.id == batch_session.last_run_id), None)
        orchestration_mode = base_run.orchestration_mode if base_run is not None else existing.schedule.orchestration_mode
        execution_units = _select_run_units(existing, orchestration_mode, None)
        downstream_map = _build_downstream_map(existing, orchestration_mode)
        rerun_ids = _collect_downstream_closure({batch_session.source_node_id}, downstream_map)
        rerun_order = [unit_id for unit_id, _ in execution_units if unit_id in rerun_ids]
        reused_ids = [unit_id for unit_id, _ in execution_units if unit_id not in rerun_ids]

        root_run_id = batch_session.root_run_id or (base_run.root_run_id if base_run is not None else f"run-{uuid4().hex[:10]}")
        attempt_number = len(batch_session.attempts) + 1
        run_id = f"run-{uuid4().hex[:10]}"
        attempt_id = f"{root_run_id}:resume-{attempt_number}"
        sink_bindings = _build_sink_bindings(existing, orchestration_mode, [batch_session.source_node_id], root_run_id, attempt_id)
        lineage_records = _build_lineage_records(existing, orchestration_mode, [batch_session.source_node_id], sink_bindings)
        exact_supported, exact_support_summary = _batch_session_exactness_summary(sink_bindings)
        blocked = request.mode == "exact" and not exact_supported
        run_started_at = _utc_now()
        source_node = next((node for node in existing.nodes if node.id == batch_session.source_node_id), None)
        if source_node is None:
            raise ValueError("The selected batch session points to a source node that no longer exists.")

        task_runs: list[NoodleDesignerRunTask] = []
        for unit_id, unit_label in execution_units:
            if unit_id in reused_ids:
                previous_task = next((task for task in (base_run.task_runs if base_run is not None else []) if task.node_id == unit_id), None)
                task_runs.append(
                    NoodleDesignerRunTask(
                        id=f"task-run-{uuid4().hex[:10]}",
                        node_id=unit_id,
                        node_label=unit_label,
                        state="reused",
                        started_at=previous_task.started_at if previous_task else None,
                        finished_at=previous_task.finished_at if previous_task else None,
                    )
                )
                continue

            if request.dry_run:
                state = "cancelled"
            elif blocked:
                state = "failed" if unit_id == batch_session.source_node_id else "skipped"
            else:
                state = "success"
            task_runs.append(
                NoodleDesignerRunTask(
                    id=f"task-run-{uuid4().hex[:10]}",
                    node_id=unit_id,
                    node_label=unit_label,
                    state=state,
                    started_at=run_started_at if state in {"success", "failed", "cancelled"} else None,
                    finished_at=run_started_at if state in {"success", "failed", "skipped", "cancelled"} else None,
                )
            )

        if request.dry_run:
            run_status = "cancelled"
            attempt_status = "blocked" if blocked else "failed"
            committed_version = batch_session.committed_version
            stats = self.repository.get_batch_record_stats(batch_session.id)
            updated_batch_session = _apply_batch_record_stats(
                batch_session,
                stats,
                batch_session.expected_count,
                batch_session.status,
                committed_version or stats.last_committed_version,
                batch_session.last_run_id or run_id,
                root_run_id,
                exact_supported,
                exact_support_summary,
                batch_session.resume_token.last_committed_at,
            )
        else:
            run_status = "failed" if blocked else "success"
            attempt_status = "blocked" if blocked else "committed"
            committed_version = (
                batch_session.committed_version
                if blocked
                else f"v{existing.version}:{root_run_id}:{attempt_id}:{batch_session.source_node_id}"
            )
            if not blocked:
                self.repository.stage_batch_records(
                    existing.id,
                    batch_session.id,
                    source_node.id,
                    batch_session.source_batch_id,
                    run_id,
                    _synthesize_batch_records(
                        source_node,
                        batch_session.source_batch_id,
                        batch_session.source_system,
                        resume_from,
                        batch_session.expected_count,
                    ),
                )
                self.repository.mark_batch_records_committed(batch_session.id, committed_version, run_id)
            stats = self.repository.get_batch_record_stats(batch_session.id)
            updated_batch_session = _apply_batch_record_stats(
                batch_session,
                stats,
                batch_session.expected_count,
                batch_session.status if blocked else "committed",
                committed_version or stats.last_committed_version,
                run_id,
                root_run_id,
                exact_supported,
                exact_support_summary,
                batch_session.resume_token.last_committed_at if blocked else run_started_at,
            ).model_copy(
                update={
                    "related_run_ids": _related_run_ids(batch_session, run_id),
                }
            )

        updated_batch_session = updated_batch_session.model_copy(
            update={
                "attempts": [
                    *updated_batch_session.attempts,
                    NoodleDesignerBatchSessionAttempt(
                        id=f"{batch_session.id}-attempt-{attempt_number}",
                        run_id=run_id,
                        kind="resume",
                        mode=request.mode,
                        status=attempt_status,
                        from_offset=resume_from,
                        started_at=run_started_at,
                        finished_at=run_started_at,
                        staged_count=updated_batch_session.staged_count,
                        next_offset=updated_batch_session.next_offset,
                        committed_version=updated_batch_session.committed_version,
                        reason=(
                            (request.reason.strip() or "Dry-run resume validation.") + " No state was changed."
                            if request.dry_run
                            else request.reason.strip() or "Resume from stored checkpoint."
                        ),
                    ),
                ]
            }
        )

        run = NoodleDesignerRun(
            id=run_id,
            label=f"Resume batch {batch_session.source_batch_id}",
            orchestrator="Soup Scheduler / Apache Airflow",
            status=run_status,
            trigger="manual",
            orchestration_mode=orchestration_mode,
            started_at=run_started_at,
            finished_at=run_started_at,
            document_version=existing.version,
            root_run_id=root_run_id,
            repair_attempt_id=attempt_id,
            repair_mode=request.mode,
            repair_outcome="blocked" if blocked else request.mode,
            repair_reason=request.reason.strip() or None,
            batch_session_ids=[batch_session.id],
            task_runs=task_runs,
            logs=[
                _run_log("log", f"Resume created for batch session {batch_session.source_batch_id}.", batch_session.source_node_id),
                _run_log("info", f"Resume will continue from offset {resume_from} of {batch_session.expected_count}.", batch_session.source_node_id),
                _run_log("info", f"Resume mode: {request.mode.replace('_', ' ')}. {exact_support_summary}", batch_session.source_node_id),
                _run_log("warn", "Exact resume was blocked because reachable sinks are not exact-capable.", batch_session.source_node_id)
                if blocked
                else _run_log("info", f"Batch committed as version {committed_version}.", batch_session.source_node_id)
                if not request.dry_run
                else _run_log("info", "Dry-run resume validation completed without mutating the batch session.", batch_session.source_node_id),
                _run_log("info", request.reason.strip(), batch_session.source_node_id)
                if request.reason.strip()
                else _run_log("log", "No resume reason was provided.", batch_session.source_node_id),
            ],
            cached_outputs=[],
            sink_bindings=sink_bindings,
            lineage_records=lineage_records,
        )

        next_batch_sessions = _merge_batch_sessions(
            [session for session in existing.batch_sessions if session.id != batch_session.id],
            [updated_batch_session],
        )
        next_document = existing.model_copy(
            update={
                "runs": [run, *existing.runs],
                "batch_sessions": next_batch_sessions,
                "saved_at": _utc_now(),
            }
        )
        saved = self.repository.save_pipeline(next_document)
        return NoodlePipelineBatchResumeResponse(pipeline=saved, batch_session=updated_batch_session, run=run)


@lru_cache(maxsize=1)
def get_noodle_pipeline_control_plane() -> NoodlePipelineControlPlaneService:
    return NoodlePipelineControlPlaneService()
