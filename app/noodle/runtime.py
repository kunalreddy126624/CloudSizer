from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.noodle.connectors.adapters import (
    NoodleConnectorAdapterContext,
    NoodleConnectorAdapterRegistry,
)
from app.noodle.connectors.sink_adapters import (
    NoodleSinkAdapterContext,
    NoodleSinkAdapterRegistry,
)
from app.noodle.schemas import (
    NoodleDesignerCachedOutput,
    NoodleDesignerConnectionRef,
    NoodleDesignerNode,
    NoodleDesignerRunLog,
    NoodlePipelineDocument,
)

SOURCE_CONNECTION_PARAM_KEYS = {"connection_ref", "connection_id", "connection", "source_connection_id"}
SINK_CONNECTION_PARAM_KEYS = {
    "sink_connection_ref",
    "sink_connection_id",
    "sink_connection",
    "target_connection_ref",
    "target_connection_id",
    "target_connection",
    "destination_connection_ref",
}
SNOWFLAKE_PLUGIN_NAMES = {"snowflake-plugin", "snowflake-sink-plugin", "snowflake"}
RUNTIME_DUMP_NODE_KINDS = {"cache", "sink"}


@dataclass(frozen=True)
class NoodleRuntimeExecutionResult:
    executed: bool
    run_status: str | None = None
    task_states: dict[str, str] = field(default_factory=dict)
    logs: list[NoodleDesignerRunLog] = field(default_factory=list)
    cached_outputs: list[NoodleDesignerCachedOutput] = field(default_factory=list)


class NoodlePipelineRuntimeService:
    def __init__(
        self,
        adapter_registry: NoodleConnectorAdapterRegistry | None = None,
        sink_adapter_registry: NoodleSinkAdapterRegistry | None = None,
    ) -> None:
        self.adapter_registry = adapter_registry or NoodleConnectorAdapterRegistry()
        self.sink_adapter_registry = sink_adapter_registry or NoodleSinkAdapterRegistry()

    def execute(
        self,
        document: NoodlePipelineDocument,
        run_id: str,
        run_started_at: str,
        build_log,
        test_node_id: str | None = None,
    ) -> NoodleRuntimeExecutionResult:
        node_by_id = {node.id: node for node in document.nodes}
        upstream_map = self._build_upstream_map(document)
        dump_nodes = self._select_dump_nodes(document, upstream_map, test_node_id)
        if not dump_nodes:
            return NoodleRuntimeExecutionResult(executed=False)

        task_states: dict[str, str] = {}
        logs: list[NoodleDesignerRunLog] = []
        cached_outputs: list[NoodleDesignerCachedOutput] = []

        for dump_node in dump_nodes:
            upstream_sources = self._collect_upstream_sources(dump_node.id, upstream_map, node_by_id)
            if not upstream_sources:
                continue

            records: list[dict[str, object]] = []
            source_labels: list[str] = []
            traversed_node_ids = self._collect_ancestor_ids(dump_node.id, upstream_map)
            traversed_node_ids.add(dump_node.id)

            for source_node in upstream_sources:
                connection = self._resolve_source_connection(document, source_node)
                if connection is None:
                    return NoodleRuntimeExecutionResult(executed=False)

                adapter_context = NoodleConnectorAdapterContext(connection=connection, source_node=source_node)
                adapter = self.adapter_registry.resolve(adapter_context)
                if adapter is None:
                    return NoodleRuntimeExecutionResult(executed=False)
                try:
                    read_result = adapter.read(adapter_context)
                except (FileNotFoundError, ImportError, OSError, ValueError, json.JSONDecodeError, KeyError):
                    return NoodleRuntimeExecutionResult(executed=False)

                source_labels.append(source_node.label)
                for record in read_result.records:
                    if len(upstream_sources) > 1:
                        annotated = dict(record)
                        annotated.setdefault("_source_node", source_node.label)
                        annotated.setdefault("_connection", connection.name)
                        records.append(annotated)
                    else:
                        records.append(record)
                logs.append(
                    build_log(
                        "info",
                        (
                            f"Resolved connection '{connection.name}' via {connection.plugin} using "
                            f"{read_result.adapter_name} and loaded {len(read_result.records)} records from "
                            f"{read_result.location} as {read_result.source_format}."
                        ),
                        source_node.id,
                    )
                )

            sink_connection = self._resolve_sink_connection(document, dump_node)
            sink_context = NoodleSinkAdapterContext(
                connection=sink_connection,
                dump_node=dump_node,
                pipeline_id=document.id,
                run_id=run_id,
            )
            sink_adapter = self.sink_adapter_registry.resolve(sink_context)
            if sink_adapter is None:
                return NoodleRuntimeExecutionResult(executed=False)
            try:
                write_result = sink_adapter.write(sink_context, records)
            except (FileNotFoundError, ImportError, OSError, ValueError, json.JSONDecodeError, KeyError):
                return NoodleRuntimeExecutionResult(executed=False)

            preview_bytes = len(write_result.preview_text.encode("utf-8"))
            for node_id in traversed_node_ids:
                task_states[node_id] = "success"
            source_label_text = ", ".join(source_labels)
            logs.append(
                build_log(
                    "info",
                    (
                        f"Dumped {write_result.approx_records} records from {source_label_text} to "
                        f"{write_result.location} using {write_result.adapter_name}."
                    ),
                    dump_node.id,
                )
            )
            cached_outputs.append(
                NoodleDesignerCachedOutput(
                    id=f"cache-output-{run_id}-{dump_node.id}",
                    node_id=dump_node.id,
                    node_label=dump_node.label,
                    source_node_id=upstream_sources[0].id if len(upstream_sources) == 1 else None,
                    source_node_label=upstream_sources[0].label if len(upstream_sources) == 1 else source_label_text,
                    format=write_result.output_format,
                    content_type=write_result.content_type,
                    summary=f"{dump_node.label} wrote runtime output to {write_result.location}.",
                    preview_text=write_result.preview_text,
                    preview_bytes=preview_bytes,
                    captured_bytes=write_result.bytes_written,
                    max_capture_bytes=write_result.bytes_written,
                    truncated=write_result.bytes_written > preview_bytes,
                    approx_records=write_result.approx_records,
                )
            )

        if not cached_outputs:
            return NoodleRuntimeExecutionResult(executed=False)

        return NoodleRuntimeExecutionResult(
            executed=True,
            run_status="success",
            task_states=task_states,
            logs=logs,
            cached_outputs=cached_outputs,
        )

    def _build_upstream_map(self, document: NoodlePipelineDocument) -> dict[str, list[str]]:
        upstream_map: dict[str, list[str]] = {}
        for edge in document.edges:
            upstream_map.setdefault(edge.target, []).append(edge.source)
        return upstream_map

    def _select_dump_nodes(
        self,
        document: NoodlePipelineDocument,
        upstream_map: dict[str, list[str]],
        test_node_id: str | None,
    ) -> list[NoodleDesignerNode]:
        dump_nodes = [node for node in document.nodes if node.kind in RUNTIME_DUMP_NODE_KINDS]
        if not test_node_id:
            return dump_nodes
        selected_node = next((node for node in document.nodes if node.id == test_node_id), None)
        if selected_node is None:
            return dump_nodes
        scoped: list[NoodleDesignerNode] = []
        for dump_node in dump_nodes:
            if dump_node.id == selected_node.id:
                scoped.append(dump_node)
                continue
            ancestor_ids = self._collect_ancestor_ids(dump_node.id, upstream_map)
            if selected_node.id in ancestor_ids:
                scoped.append(dump_node)
        return scoped

    def _collect_ancestor_ids(self, node_id: str, upstream_map: dict[str, list[str]]) -> set[str]:
        visited: set[str] = set()
        stack = list(upstream_map.get(node_id, []))
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            stack.extend(upstream_map.get(current, []))
        return visited

    def _collect_upstream_sources(
        self,
        node_id: str,
        upstream_map: dict[str, list[str]],
        node_by_id: dict[str, NoodleDesignerNode],
    ) -> list[NoodleDesignerNode]:
        sources: list[NoodleDesignerNode] = []
        for ancestor_id in self._collect_ancestor_ids(node_id, upstream_map):
            ancestor = node_by_id.get(ancestor_id)
            if ancestor is not None and ancestor.kind == "source":
                sources.append(ancestor)
        sources.sort(key=lambda item: item.label.lower())
        return sources

    def _resolve_source_connection(
        self,
        document: NoodlePipelineDocument,
        source_node: NoodleDesignerNode,
    ) -> NoodleDesignerConnectionRef | None:
        params = self._param_map(source_node)
        ref_value = next((params[key] for key in SOURCE_CONNECTION_PARAM_KEYS if key in params), None)
        if ref_value:
            return self._find_connection(document, ref_value)
        if len(document.connection_refs) == 1:
            return document.connection_refs[0]
        return None

    def _resolve_sink_connection(
        self,
        document: NoodlePipelineDocument,
        dump_node: NoodleDesignerNode,
    ) -> NoodleDesignerConnectionRef | None:
        params = self._param_map(dump_node)
        ref_value = next((params[key] for key in SINK_CONNECTION_PARAM_KEYS if key in params), None)
        if ref_value:
            return self._find_connection(document, ref_value)
        snowflake_connections = [
            connection
            for connection in document.connection_refs
            if connection.plugin.strip().lower() in SNOWFLAKE_PLUGIN_NAMES
        ]
        if len(snowflake_connections) == 1:
            return snowflake_connections[0]
        return None

    def _find_connection(
        self,
        document: NoodlePipelineDocument,
        ref_value: str,
    ) -> NoodleDesignerConnectionRef | None:
        for connection in document.connection_refs:
            if ref_value in {connection.id, connection.name, connection.auth_ref}:
                return connection
        return None

    def _param_map(self, node: NoodleDesignerNode) -> dict[str, str]:
        return {
            param.key.strip().lower(): param.value.strip()
            for param in node.params
            if param.key.strip() and param.value is not None
        }
