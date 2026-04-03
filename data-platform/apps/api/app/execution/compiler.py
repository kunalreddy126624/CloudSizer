from __future__ import annotations

from app.schemas.pipeline import PipelineSpec


class ExecutionPlanCompiler:
    def compile(self, spec: PipelineSpec) -> dict:
        return {
            "pipelineId": spec.pipelineId,
            "version": spec.version,
            "tasks": [
                {
                    "nodeId": node.id,
                    "nodeName": node.name,
                    "type": node.type,
                    "upstreams": [edge.source for edge in spec.edges if edge.target == node.id],
                    "downstreams": [edge.target for edge in spec.edges if edge.source == node.id],
                }
                for node in spec.nodes
            ],
        }
