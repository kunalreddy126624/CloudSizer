from __future__ import annotations

from collections import defaultdict, deque

from croniter import croniter

from app.schemas.pipeline import PipelineSpec, ValidationIssue

VALID_NODE_TYPES = {
    "source.postgres": {"connectionId", "query"},
    "source.s3": {"connectionId", "bucket"},
    "transform.python": {"entrypoint", "functionName"},
    "transform.sql": {"dialect", "sql"},
    "sink.snowflake": {"connectionId", "database", "schema", "table"},
    "sink.bigquery": {"connectionId", "dataset", "table"},
    "sink.cache_log": {"connectionId", "cacheKey", "format"},
}


class ValidationService:
    def validate(self, spec: PipelineSpec) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []

        if not spec.nodes:
            return [ValidationIssue(code="empty_pipeline", message="Pipeline must include at least one node.", severity="error")]

        node_ids: set[str] = set()
        for node in spec.nodes:
            if node.id in node_ids:
                issues.append(
                    ValidationIssue(
                        code="duplicate_node_id",
                        message=f"Duplicate node id: {node.id}",
                        severity="error",
                        nodeId=node.id,
                    )
                )
            node_ids.add(node.id)

            if node.type not in VALID_NODE_TYPES:
                issues.append(
                    ValidationIssue(
                        code="invalid_node_type",
                        message=f"Unsupported node type: {node.type}",
                        severity="error",
                        nodeId=node.id,
                    )
                )
                continue

            required_fields = VALID_NODE_TYPES[node.type]
            missing = [field for field in required_fields if not node.config.get(field)]
            if missing:
                issues.append(
                    ValidationIssue(
                        code="missing_required_config",
                        message=f"Node {node.name} is missing required config: {', '.join(sorted(missing))}",
                        severity="error",
                        nodeId=node.id,
                    )
                )

        seen_pairs: set[tuple[str, str]] = set()
        inbound: dict[str, int] = defaultdict(int)
        outbound: dict[str, int] = defaultdict(int)
        graph: dict[str, list[str]] = defaultdict(list)
        indegree: dict[str, int] = {node.id: 0 for node in spec.nodes}

        for edge in spec.edges:
            if edge.source not in node_ids or edge.target not in node_ids:
                issues.append(
                    ValidationIssue(
                        code="missing_edge_node",
                        message=f"Edge {edge.id} points to a missing node.",
                        severity="error",
                        edgeId=edge.id,
                    )
                )
                continue

            if edge.source == edge.target:
                issues.append(
                    ValidationIssue(
                        code="self_loop",
                        message=f"Edge {edge.id} is a self-loop.",
                        severity="error",
                        edgeId=edge.id,
                    )
                )

            pair = (edge.source, edge.target)
            if pair in seen_pairs:
                issues.append(
                    ValidationIssue(
                        code="duplicate_edge",
                        message=f"Duplicate edge detected for {edge.source} -> {edge.target}.",
                        severity="error",
                        edgeId=edge.id,
                    )
                )
            else:
                seen_pairs.add(pair)

            inbound[edge.target] += 1
            outbound[edge.source] += 1
            graph[edge.source].append(edge.target)
            indegree[edge.target] = indegree.get(edge.target, 0) + 1

        queue = deque(node_id for node_id, degree in indegree.items() if degree == 0)
        visited = 0
        while queue:
            current = queue.popleft()
            visited += 1
            for neighbor in graph[current]:
                indegree[neighbor] -= 1
                if indegree[neighbor] == 0:
                    queue.append(neighbor)
        if visited != len(spec.nodes):
            issues.append(ValidationIssue(code="cycle_detected", message="Pipeline contains a cycle.", severity="error"))

        if not any(inbound.get(node.id, 0) == 0 for node in spec.nodes):
            issues.append(ValidationIssue(code="missing_root_node", message="Pipeline must have at least one root node.", severity="error"))
        if not any(outbound.get(node.id, 0) == 0 for node in spec.nodes):
            issues.append(
                ValidationIssue(code="missing_terminal_node", message="Pipeline must have at least one terminal node.", severity="error")
            )

        if spec.schedule.mode == "cron":
            if not spec.schedule.cron or not croniter.is_valid(spec.schedule.cron):
                issues.append(
                    ValidationIssue(
                        code="invalid_cron",
                        message="Schedule mode cron requires a valid cron expression.",
                        severity="error",
                    )
                )

        return issues
