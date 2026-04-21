from __future__ import annotations

from dataclasses import dataclass
import re

from app.noodle.config import NoodleSettings
from app.noodle.connectors.registry import CONNECTOR_BY_SOURCE_KIND
from app.noodle.microservices.registry import get_microservice_specs
from app.noodle.sample_specs import REFERENCE_SPECS
from app.noodle.schemas import (
    NoodleAgentKind,
    NoodleAgentQueryRequest,
    NoodleAgentQueryResponse,
    NoodleDesignerConnectionRef,
    NoodleDesignerEdge,
    NoodleDesignerNode,
    NoodlePipelineDocument,
    NoodleRagQueryRequest,
    NoodleRagQueryResponse,
    NoodleRagSource,
    NoodleSavedArchitectureContext,
)


@dataclass(frozen=True)
class _KnowledgeDocument:
    id: str
    title: str
    kind: str
    content: str
    tags: tuple[str, ...]


_AGENT_ASSISTANT_NAMES: dict[NoodleAgentKind, str] = {
    "estimator": "agent-estimator",
    "architect": "agent-architect",
    "momo": "agent-momo",
}

_AGENT_DEFAULT_GUIDANCE: dict[NoodleAgentKind, str] = {
    "estimator": (
        "Focus on workload shape, availability, storage, database, regional placement, and provider tradeoffs. "
        "If inputs are incomplete, ask for the missing sizing variables and anchor the answer to the closest known workload pattern."
    ),
    "architect": (
        "Focus on system design, control-plane versus execution-plane responsibilities, component fit, data flow, scaling, and security boundaries. "
        "If the prompt is underspecified, recover from the saved architecture and current diagram state."
    ),
    "momo": (
        "Focus on pipeline structure, plugin-backed sources, orchestration, retries, schedules, transformations, lineage, and deployment wiring. "
        "If the user prompt is narrow, recover from the current pipeline document and architect system design."
    ),
}

_AGENT_EXPANSION_TERMS: dict[NoodleAgentKind, tuple[str, ...]] = {
    "estimator": ("estimate", "sizing", "cost", "provider", "region", "storage", "database", "availability"),
    "architect": ("architecture", "system", "design", "components", "data", "flow", "scaling", "security"),
    "momo": ("pipeline", "orchestration", "plugins", "nodes", "schedule", "retries", "workers", "lineage"),
}


class NoodleRagService:
    def __init__(self, settings: NoodleSettings) -> None:
        self.settings = settings
        self._documents = self._build_documents()

    def query(self, request: NoodleRagQueryRequest) -> NoodleRagQueryResponse:
        documents = self._documents + self._build_context_documents(
            request.architecture_context,
            request.pipeline_document,
        )
        ranked_sources = self._rank_sources(documents, request.query, request.max_results)

        if not self._tokenize(request.query):
            return NoodleRagQueryResponse(
                query=request.query,
                answer="No searchable terms were found in the request.",
                sources=[],
                retrieval_backend="in-memory-keyword-index",
            )

        if not ranked_sources:
            return NoodleRagQueryResponse(
                query=request.query,
                answer="No relevant knowledge snippets were found in the built-in Noodle knowledge base.",
                sources=[],
                retrieval_backend="in-memory-keyword-index",
            )

        answer = " ".join(
            f"{source.title}: {source.snippet}"
            for source in ranked_sources
        )
        return NoodleRagQueryResponse(
            query=request.query,
            answer=answer,
            sources=ranked_sources,
            retrieval_backend="in-memory-keyword-index",
        )

    def query_agent(self, request: NoodleAgentQueryRequest) -> NoodleAgentQueryResponse:
        documents = self._documents + self._build_context_documents(
            request.architecture_context,
            request.pipeline_document,
        )
        attempted_queries = [request.user_turn]
        ranked_sources = self._rank_sources(documents, request.user_turn, request.max_results)
        recovered = False
        recovery_strategy = "direct"

        if not self._is_sufficient_match(ranked_sources):
            repaired_query = self._repair_query(request)
            if repaired_query and repaired_query != request.user_turn:
                attempted_queries.append(repaired_query)
                ranked_sources = self._rank_sources(documents, repaired_query, request.max_results)
                recovered = bool(ranked_sources)
                recovery_strategy = "query_rewrite"

        if not self._is_sufficient_match(ranked_sources):
            fallback_query = self._fallback_query(request)
            if fallback_query and fallback_query not in attempted_queries:
                attempted_queries.append(fallback_query)
                ranked_sources = self._rank_sources(documents, fallback_query, request.max_results)
                recovered = bool(ranked_sources)
                recovery_strategy = "fallback_context"

        brief = _AGENT_DEFAULT_GUIDANCE[request.agent]
        if ranked_sources:
            answer = self._agent_answer(request.agent, ranked_sources, recovered, recovery_strategy)
            return NoodleAgentQueryResponse(
                assistant=_AGENT_ASSISTANT_NAMES[request.agent],
                answer=answer,
                brief=brief,
                sources=ranked_sources,
                retrieval_backend="in-memory-keyword-index+self-healing",
                recovered=recovered,
                recovery_strategy=recovery_strategy,
                attempted_queries=attempted_queries,
            )

        return NoodleAgentQueryResponse(
            assistant=_AGENT_ASSISTANT_NAMES[request.agent],
            answer=self._fallback_guidance(request),
            brief=brief,
            sources=[],
            retrieval_backend="in-memory-keyword-index+self-healing",
            recovered=True,
            recovery_strategy="fallback_guidance",
            attempted_queries=attempted_queries,
        )

    def _build_context_documents(
        self,
        architecture_context: NoodleSavedArchitectureContext | None,
        pipeline_document: NoodlePipelineDocument | None,
    ) -> list[_KnowledgeDocument]:
        documents: list[_KnowledgeDocument] = []
        if architecture_context is not None:
            documents.extend(self._architecture_documents(architecture_context))
        if pipeline_document is not None:
            documents.extend(self._pipeline_documents(pipeline_document))
        return documents

    def _build_documents(self) -> list[_KnowledgeDocument]:
        documents: list[_KnowledgeDocument] = [
            _KnowledgeDocument(
                id="platform-overview",
                title="Noodle Platform Overview",
                kind="platform",
                content=(
                    "Noodle Orchestrator separates control plane APIs, metadata, scheduling, and auth from "
                    "execution plane workers, retries, plugin runtime, logs, and lineage. "
                    f"Workflow backend is {self.settings.workflow_backend}, event backbone is {self.settings.event_backbone}, "
                    f"metadata backend is {self.settings.metadata_backend}, and lakehouse format is {self.settings.lakehouse_format}."
                ),
                tags=("platform", "control-plane", "execution-plane", self.settings.workflow_backend),
            ),
            _KnowledgeDocument(
                id="agent-estimator-playbook",
                title="Agent Estimator Playbook",
                kind="agent_playbook",
                content=(
                    "Agent Estimator translates workload language into sizing drivers. "
                    "It should reason about users, throughput, storage, managed databases, resilience, regional placement, "
                    "monthly cost, and provider fit while highlighting missing sizing inputs."
                ),
                tags=("agent", "estimator", "sizing", "cost", "provider-fit"),
            ),
            _KnowledgeDocument(
                id="agent-architect-playbook",
                title="Agent Architect Playbook",
                kind="agent_playbook",
                content=(
                    "Agent Architect turns workload requirements into system design. "
                    "It should separate control plane from execution plane, map components to cloud services, "
                    "explain data flow, scaling, and security boundaries, and align the design to the saved architecture context."
                ),
                tags=("agent", "architect", "system-design", "control-plane", "execution-plane"),
            ),
            _KnowledgeDocument(
                id="agent-momo-playbook",
                title="Agent Momo Playbook",
                kind="agent_playbook",
                content=(
                    "Agent Momo guides pipeline design. "
                    "It should understand nodes, edges, plugins, schedules, retries, lineage, transformations, deployment, "
                    "and how the current pipeline document fits the architect system design."
                ),
                tags=("agent", "momo", "pipeline", "orchestration", "lineage"),
            ),
        ]

        for spec in REFERENCE_SPECS:
            documents.append(
                _KnowledgeDocument(
                    id=spec.id,
                    title=spec.name,
                    kind="reference_spec",
                    content=(
                        f"{spec.summary} Business goal: {spec.sample_intent.business_goal} "
                        f"Deployment scope: {spec.sample_intent.deployment_scope}. "
                        f"Sources: {', '.join(source.name for source in spec.sample_intent.sources)}. "
                        f"Target consumers: {', '.join(spec.sample_intent.target_consumers)}."
                    ),
                    tags=tuple(spec.tags),
                )
            )

        for source_kind, (connector_type, mode) in CONNECTOR_BY_SOURCE_KIND.items():
            documents.append(
                _KnowledgeDocument(
                    id=f"connector-{source_kind}",
                    title=f"{source_kind} connector",
                    kind="connector",
                    content=(
                        f"Source kind {source_kind} uses connector type {connector_type} with default mode {mode}. "
                        "Connectors are plugin-backed and feed Noodle ingestion plans."
                    ),
                    tags=("connector", source_kind, connector_type, mode),
                )
            )

        for spec in get_microservice_specs():
            endpoint_text = ", ".join(f"{api.method} {api.path}" for api in spec.apis)
            documents.append(
                _KnowledgeDocument(
                    id=spec.name,
                    title=spec.name,
                    kind="microservice",
                    content=(
                        f"{spec.responsibility} Domain: {spec.domain}. Deployment pattern: {spec.deployment_pattern}. "
                        f"APIs: {endpoint_text}. Dependencies: {', '.join(spec.dependencies)}."
                    ),
                    tags=(spec.domain, spec.deployment_pattern, *spec.dependencies[:3]),
                )
            )
        return documents

    def _architecture_documents(self, architecture_context: NoodleSavedArchitectureContext) -> list[_KnowledgeDocument]:
        documents = [
            _KnowledgeDocument(
                id=f"architecture-{self._slug(architecture_context.name)}",
                title=f'Architecture context: {architecture_context.name}',
                kind="architecture_context",
                content=(
                    f"Prompt: {architecture_context.prompt}. Summary: {architecture_context.summary}. "
                    f"System design: {architecture_context.system_design}. "
                    f"Components: {', '.join(architecture_context.components)}. "
                    f"Cloud services: {', '.join(architecture_context.cloud_services)}. "
                    f"Data flow: {' -> '.join(architecture_context.data_flow)}. "
                    f"Scaling strategy: {', '.join(architecture_context.scaling_strategy)}. "
                    f"Security considerations: {', '.join(architecture_context.security_considerations)}. "
                    f"Assumptions: {', '.join(architecture_context.assumptions)}."
                ),
                tags=("architecture", *architecture_context.selected_providers[:3]),
            )
        ]
        if architecture_context.system_design:
            documents.append(
                _KnowledgeDocument(
                    id=f"architecture-system-design-{self._slug(architecture_context.name)}",
                    title=f'System design for {architecture_context.name}',
                    kind="system_design",
                    content=architecture_context.system_design,
                    tags=("system-design", *architecture_context.selected_providers[:3]),
                )
            )
        return documents

    def _pipeline_documents(self, pipeline_document: NoodlePipelineDocument) -> list[_KnowledgeDocument]:
        node_summary = ", ".join(self._describe_node(node) for node in pipeline_document.nodes[:12])
        edge_summary = ", ".join(self._describe_edge(edge) for edge in pipeline_document.edges[:12])
        connection_summary = ", ".join(self._describe_connection(connection) for connection in pipeline_document.connection_refs[:8])
        task_summary = ", ".join(task.name for task in (pipeline_document.orchestrator_plan.tasks if pipeline_document.orchestrator_plan else [])[:8])
        return [
            _KnowledgeDocument(
                id=f"pipeline-{self._slug(pipeline_document.id)}",
                title=f'Pipeline designer document: {pipeline_document.name}',
                kind="pipeline_document",
                content=(
                    f"Status: {pipeline_document.status}. Version: {pipeline_document.version}. "
                    f"Nodes: {node_summary}. Edges: {edge_summary}. Connections: {connection_summary}. "
                    f"Deployment target: {pipeline_document.deployment.deploy_target}. "
                    f"Schedule trigger: {pipeline_document.schedule.trigger}. "
                    f"Orchestrator tasks: {task_summary}."
                ),
                tags=("pipeline", pipeline_document.status, pipeline_document.deployment.deploy_target),
            )
        ]

    def _score_document(self, document: _KnowledgeDocument, query_tokens: set[str]) -> NoodleRagSource | None:
        doc_tokens = self._tokenize(" ".join([document.title, document.content, " ".join(document.tags)]))
        overlap = query_tokens & doc_tokens
        if not overlap:
            return None

        score = len(overlap) / len(query_tokens)
        if document.kind == "reference_spec":
            score += 0.15
        if document.kind == "microservice":
            score += 0.1
        if document.kind == "agent_playbook":
            score += 0.18
        if document.kind in {"architecture_context", "system_design", "pipeline_document"}:
            score += 0.2

        return NoodleRagSource(
            id=document.id,
            title=document.title,
            kind=document.kind,
            score=round(score, 4),
            snippet=self._snippet_for(document, overlap),
            tags=list(document.tags),
        )

    def _rank_sources(
        self,
        documents: list[_KnowledgeDocument],
        query: str,
        max_results: int,
    ) -> list[NoodleRagSource]:
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        return sorted(
            (source for source in (self._score_document(document, query_tokens) for document in documents) if source is not None),
            key=lambda item: item.score,
            reverse=True,
        )[:max_results]

    @staticmethod
    def _is_sufficient_match(ranked_sources: list[NoodleRagSource]) -> bool:
        if not ranked_sources:
            return False
        top_score = ranked_sources[0].score
        return top_score >= 0.34 or (len(ranked_sources) >= 2 and top_score >= 0.24)

    def _repair_query(self, request: NoodleAgentQueryRequest) -> str:
        context_parts = [
            request.user_turn,
            *request.conversation_history[-3:],
            *request.context_blocks[:4],
        ]
        if request.architecture_context is not None:
            context_parts.extend(
                [
                    request.architecture_context.summary,
                    request.architecture_context.system_design,
                    " ".join(request.architecture_context.components[:6]),
                    " ".join(request.architecture_context.data_flow[:6]),
                ]
            )
        if request.pipeline_document is not None:
            context_parts.extend(
                [
                    request.pipeline_document.name,
                    " ".join(node.label for node in request.pipeline_document.nodes[:8]),
                    " ".join(node.kind for node in request.pipeline_document.nodes[:8]),
                ]
            )
        if request.intent is not None:
            context_parts.extend(
                [
                    request.intent.name,
                    request.intent.business_goal,
                    " ".join(source.name for source in request.intent.sources[:6]),
                ]
            )

        tokens: list[str] = []
        for token in self._tokenize(" ".join(context_parts)):
            if token not in tokens:
                tokens.append(token)
        for term in _AGENT_EXPANSION_TERMS[request.agent]:
            if term not in tokens:
                tokens.append(term)
        return " ".join(tokens[:28])

    def _fallback_query(self, request: NoodleAgentQueryRequest) -> str:
        fallback_parts = [request.user_turn, *_AGENT_EXPANSION_TERMS[request.agent]]
        if request.architecture_context is not None:
            fallback_parts.append(request.architecture_context.system_design or request.architecture_context.summary)
        if request.pipeline_document is not None:
            fallback_parts.append(
                " ".join(
                    f"{node.label} {node.kind}"
                    for node in request.pipeline_document.nodes[:6]
                )
            )
        if request.context_blocks:
            fallback_parts.append(" ".join(request.context_blocks[:2]))
        return " ".join(part for part in fallback_parts if part).strip()

    def _agent_answer(
        self,
        agent: NoodleAgentKind,
        ranked_sources: list[NoodleRagSource],
        recovered: bool,
        recovery_strategy: str,
    ) -> str:
        lead = {
            "estimator": "Agent Estimator guidance:",
            "architect": "Agent Architect guidance:",
            "momo": "Agent Momo guidance:",
        }[agent]
        recovery_text = ""
        if recovered and recovery_strategy != "direct":
            recovery_text = " I recovered the query context before answering."
        snippet_text = " ".join(f"{source.title}: {source.snippet}" for source in ranked_sources)
        return f"{lead}{recovery_text} {snippet_text}".strip()

    def _fallback_guidance(self, request: NoodleAgentQueryRequest) -> str:
        context_fragments = [block for block in request.context_blocks[:2] if block]
        if request.architecture_context is not None and request.architecture_context.system_design:
            context_fragments.append(request.architecture_context.system_design[:240])
        if request.pipeline_document is not None:
            context_fragments.append(
                f"Pipeline has {len(request.pipeline_document.nodes)} nodes and {len(request.pipeline_document.edges)} edges."
            )
        context_text = " ".join(context_fragments).strip()
        base = _AGENT_DEFAULT_GUIDANCE[request.agent]
        if context_text:
            return f"{base} Recovered context: {context_text}"
        return base

    def _snippet_for(self, document: _KnowledgeDocument, overlap: set[str]) -> str:
        sentences = re.split(r"(?<=[.!?])\s+", document.content.strip())
        normalized_overlap = {token.lower() for token in overlap}
        for sentence in sentences:
            sentence_tokens = self._tokenize(sentence)
            if normalized_overlap & sentence_tokens:
                return sentence.strip()
        return document.content.strip()

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-z0-9_/-]+", text.lower())
            if len(token) >= 3
        }

    @staticmethod
    def _slug(value: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
        return normalized or "context"

    @staticmethod
    def _describe_node(node: NoodleDesignerNode) -> str:
        return f"{node.label} ({node.kind})"

    @staticmethod
    def _describe_edge(edge: NoodleDesignerEdge) -> str:
        return f"{edge.source}->{edge.target}"

    @staticmethod
    def _describe_connection(connection: NoodleDesignerConnectionRef) -> str:
        return f"{connection.name} ({connection.plugin} in {connection.environment})"
