from __future__ import annotations

from dataclasses import dataclass, field
import re

from app.noodle.config import NoodleSettings
from app.noodle.connectors.registry import CONNECTOR_BY_SOURCE_KIND
from app.noodle.microservices.registry import get_microservice_specs
from app.noodle.sample_specs import REFERENCE_SPECS
from app.noodle.schemas import (
    NoodleAgentKind,
    NoodleAgentQueryRequest,
    NoodleAgentQueryResponse,
    NoodleAgentRecoveryStrategy,
    NoodleAgentWorkflowStage,
    NoodleAgentWorkflowStatus,
    NoodleAgentWorkflowStep,
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


@dataclass
class _AgentWorkflowContext:
    attempted_queries: list[str]
    ranked_sources: list[NoodleRagSource]
    recovered: bool
    recovery_strategy: NoodleAgentRecoveryStrategy
    workflow_trace: list[NoodleAgentWorkflowStep] = field(default_factory=list)
    latest_query: str = ""
    response_answer: str = ""


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
        self._web_documents = self._build_web_documents()

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
        workflow = _AgentWorkflowContext(
            attempted_queries=[request.user_turn],
            ranked_sources=[],
            recovered=False,
            recovery_strategy="direct",
            latest_query=request.user_turn,
        )

        workflow.ranked_sources = self._rank_sources(documents, request.user_turn, request.max_results)
        self._add_trace(
            workflow,
            stage="retrieval",
            status="success" if workflow.ranked_sources else "retry",
            detail=f"Retrieved {len(workflow.ranked_sources)} sources for initial query.",
        )

        retrieval_passed = self._grade_retrieval(workflow.ranked_sources)
        self._add_trace(
            workflow,
            stage="retrieval_grader",
            status="success" if retrieval_passed else "retry",
            detail=(
                "Retrieved chunks are relevant to the user query."
                if retrieval_passed
                else "Retrieved chunks are weak or missing; retry with rewritten query."
            ),
        )

        if not retrieval_passed:
            rewritten_query = self._repair_query(request)
            if rewritten_query and rewritten_query not in workflow.attempted_queries:
                workflow.attempted_queries.append(rewritten_query)
                workflow.latest_query = rewritten_query
                self._add_trace(
                    workflow,
                    stage="query_rewriter",
                    status="success",
                    detail="Expanded the query for better recall.",
                )
                workflow.ranked_sources = self._rank_sources(documents, rewritten_query, request.max_results)
                workflow.recovered = bool(workflow.ranked_sources)
                workflow.recovery_strategy = "query_rewrite"
                self._add_trace(
                    workflow,
                    stage="retrieval",
                    status="success" if workflow.ranked_sources else "retry",
                    detail=f"Retrieved {len(workflow.ranked_sources)} sources after query rewrite.",
                )
                retrieval_passed = self._grade_retrieval(workflow.ranked_sources)
                self._add_trace(
                    workflow,
                    stage="retrieval_grader",
                    status="success" if retrieval_passed else "retry",
                    detail=(
                        "Rewritten query produced relevant chunks."
                        if retrieval_passed
                        else "Rewritten query is still weak; trying fallback context query."
                    ),
                )
            else:
                self._add_trace(
                    workflow,
                    stage="query_rewriter",
                    status="failed",
                    detail="Could not build a rewritten query.",
                )

        if not retrieval_passed:
            fallback_query = self._fallback_query(request)
            if fallback_query and fallback_query not in workflow.attempted_queries:
                workflow.attempted_queries.append(fallback_query)
                workflow.latest_query = fallback_query
                workflow.ranked_sources = self._rank_sources(documents, fallback_query, request.max_results)
                workflow.recovered = bool(workflow.ranked_sources)
                workflow.recovery_strategy = "fallback_context"
                self._add_trace(
                    workflow,
                    stage="query_rewriter",
                    status="success",
                    detail="Built a fallback query from architecture and pipeline context.",
                )
                self._add_trace(
                    workflow,
                    stage="retrieval",
                    status="success" if workflow.ranked_sources else "failed",
                    detail=f"Retrieved {len(workflow.ranked_sources)} sources after fallback query.",
                )
                retrieval_passed = self._grade_retrieval(workflow.ranked_sources)
                self._add_trace(
                    workflow,
                    stage="retrieval_grader",
                    status="success" if retrieval_passed else "failed",
                    detail=(
                        "Fallback context query produced relevant chunks."
                        if retrieval_passed
                        else "Fallback context query still did not produce sufficiently relevant chunks."
                    ),
                )

        brief = _AGENT_DEFAULT_GUIDANCE[request.agent]
        if workflow.ranked_sources:
            answer, workflow = self._run_generation_workflow(
                request=request,
                workflow=workflow,
                base_sources=workflow.ranked_sources,
                documents=documents,
            )
            return NoodleAgentQueryResponse(
                assistant=_AGENT_ASSISTANT_NAMES[request.agent],
                answer=answer,
                brief=brief,
                sources=workflow.ranked_sources,
                retrieval_backend="in-memory-keyword-index+self-healing-workflow",
                recovered=workflow.recovered,
                recovery_strategy=workflow.recovery_strategy,
                attempted_queries=workflow.attempted_queries,
                workflow_trace=workflow.workflow_trace,
            )

        self._add_trace(
            workflow,
            stage="generation",
            status="skipped",
            detail="Skipping generation because no relevant chunks were found.",
        )
        self._add_trace(
            workflow,
            stage="final",
            status="success",
            detail="Returning fallback guidance.",
        )
        return NoodleAgentQueryResponse(
            assistant=_AGENT_ASSISTANT_NAMES[request.agent],
            answer=self._fallback_guidance(request),
            brief=brief,
            sources=[],
            retrieval_backend="in-memory-keyword-index+self-healing-workflow",
            recovered=True,
            recovery_strategy="fallback_guidance",
            attempted_queries=workflow.attempted_queries,
            workflow_trace=workflow.workflow_trace,
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

    def _build_web_documents(self) -> list[_KnowledgeDocument]:
        # Lightweight external corpus used by the self-healing "web search" stage.
        return [
            _KnowledgeDocument(
                id="web-rag-pattern-retrieval-grading",
                title="Web: Retrieval grading best practice",
                kind="web_search",
                content=(
                    "Robust RAG systems grade retrieval relevance before generation. "
                    "When retrieval is weak, rewrite the query and retry retrieval with higher recall terms."
                ),
                tags=("web", "rag", "retrieval-grader", "query-rewrite"),
            ),
            _KnowledgeDocument(
                id="web-rag-pattern-grounding",
                title="Web: Hallucination checking with grounding",
                kind="web_search",
                content=(
                    "Ground generation in retrieved chunks and reject responses with weak evidence overlap. "
                    "When grounding fails, fetch external context and regenerate the answer."
                ),
                tags=("web", "rag", "hallucination-checker", "grounding"),
            ),
            _KnowledgeDocument(
                id="web-rag-pattern-quality-loop",
                title="Web: Answer quality retry loop",
                kind="web_search",
                content=(
                    "After grounding passes, run an answer-quality check to verify the response addresses the user query. "
                    "If quality is low, regenerate with a tighter prompt and explicit question constraints."
                ),
                tags=("web", "rag", "quality-check", "regenerate"),
            ),
            _KnowledgeDocument(
                id="web-noodle-control-execution-separation",
                title="Web: Control plane and execution plane separation",
                kind="web_search",
                content=(
                    "Control plane services handle authoring, metadata, scheduling, and governance while execution plane "
                    "services run workers, retries, transforms, and serving tasks with isolated scaling boundaries."
                ),
                tags=("web", "control-plane", "execution-plane", "workers"),
            ),
        ]

    def _run_generation_workflow(
        self,
        request: NoodleAgentQueryRequest,
        workflow: _AgentWorkflowContext,
        base_sources: list[NoodleRagSource],
        documents: list[_KnowledgeDocument],
    ) -> tuple[str, _AgentWorkflowContext]:
        ranked_sources = list(base_sources)
        answer = ""
        regeneration_attempted = False

        for generation_attempt in range(1, 4):
            answer = self._agent_answer(
                request.agent,
                ranked_sources,
                workflow.recovered,
                workflow.recovery_strategy,
            )
            workflow.response_answer = answer
            self._add_trace(
                workflow,
                stage="generation",
                status="success",
                detail=f"Generated draft answer (attempt {generation_attempt}).",
            )

            grounded = self._is_answer_grounded(answer, ranked_sources, workflow.latest_query)
            if grounded:
                self._add_trace(
                    workflow,
                    stage="hallucination_checker",
                    status="success",
                    detail="Answer is grounded in retrieved context.",
                )
            else:
                self._add_trace(
                    workflow,
                    stage="hallucination_checker",
                    status="retry",
                    detail="Answer grounding is weak; fetching web context and retrying.",
                )
                web_sources = self._web_search_sources(request, workflow.latest_query, documents, request.max_results)
                if web_sources:
                    ranked_sources = self._merge_ranked_sources(ranked_sources, web_sources, request.max_results)
                    workflow.ranked_sources = ranked_sources
                    workflow.recovered = True
                    workflow.recovery_strategy = "web_search"
                    self._add_trace(
                        workflow,
                        stage="web_search",
                        status="success",
                        detail=f"Fetched {len(web_sources)} external context snippets.",
                    )
                    continue
                self._add_trace(
                    workflow,
                    stage="web_search",
                    status="failed",
                    detail="No external context found; continuing with current evidence.",
                )

            quality_passed = self._passes_answer_quality(answer, request.user_turn)
            if quality_passed:
                self._add_trace(
                    workflow,
                    stage="answer_quality_check",
                    status="success",
                    detail="Answer directly addresses the user query.",
                )
                self._add_trace(
                    workflow,
                    stage="final",
                    status="success",
                    detail="Returning validated answer.",
                )
                workflow.ranked_sources = ranked_sources
                return answer, workflow

            self._add_trace(
                workflow,
                stage="answer_quality_check",
                status="retry",
                detail="Answer does not fully address the query; regenerating with tighter prompt.",
            )

            if regeneration_attempted:
                break

            refined_query = self._regenerate_query(request, answer)
            if refined_query and refined_query not in workflow.attempted_queries:
                workflow.attempted_queries.append(refined_query)
                workflow.latest_query = refined_query
                workflow.recovered = True
                workflow.recovery_strategy = "regenerate"
                regeneration_attempted = True
                self._add_trace(
                    workflow,
                    stage="regenerate",
                    status="success",
                    detail="Reframed query constraints for a better final answer.",
                )

                refined_sources = self._rank_sources(documents, refined_query, request.max_results)
                if refined_sources:
                    ranked_sources = self._merge_ranked_sources(ranked_sources, refined_sources, request.max_results)
                    workflow.ranked_sources = ranked_sources
                continue

            self._add_trace(
                workflow,
                stage="regenerate",
                status="failed",
                detail="Could not regenerate with improved constraints.",
            )
            break

        self._add_trace(
            workflow,
            stage="final",
            status="success",
            detail="Returning best-effort answer after self-healing retries.",
        )
        workflow.ranked_sources = ranked_sources
        return answer or self._fallback_guidance(request), workflow

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
    def _add_trace(
        workflow: _AgentWorkflowContext,
        stage: NoodleAgentWorkflowStage,
        status: NoodleAgentWorkflowStatus,
        detail: str,
    ) -> None:
        workflow.workflow_trace.append(
            NoodleAgentWorkflowStep(
                stage=stage,
                status=status,
                detail=detail,
            )
        )

    @staticmethod
    def _grade_retrieval(ranked_sources: list[NoodleRagSource]) -> bool:
        if not ranked_sources:
            return False
        top_score = ranked_sources[0].score
        mean_score = sum(item.score for item in ranked_sources) / len(ranked_sources)
        return top_score >= 0.32 or mean_score >= 0.24

    def _is_answer_grounded(
        self,
        answer: str,
        ranked_sources: list[NoodleRagSource],
        query: str,
    ) -> bool:
        if not ranked_sources:
            return False
        answer_tokens = self._tokenize(answer)
        if not answer_tokens:
            return False
        context_tokens = set()
        for source in ranked_sources:
            context_tokens |= self._tokenize(f"{source.title} {source.snippet} {' '.join(source.tags)}")
        query_tokens = self._tokenize(query)
        supported_tokens = answer_tokens & (context_tokens | query_tokens)
        return len(supported_tokens) / max(len(answer_tokens), 1) >= 0.28

    def _passes_answer_quality(self, answer: str, user_query: str) -> bool:
        answer_tokens = self._tokenize(answer)
        query_tokens = self._tokenize(user_query)
        if not answer_tokens or not query_tokens:
            return False
        overlap = answer_tokens & query_tokens
        coverage = len(overlap) / len(query_tokens)
        return coverage >= 0.22 and len(answer.strip()) >= 48

    def _web_search_sources(
        self,
        request: NoodleAgentQueryRequest,
        query: str,
        documents: list[_KnowledgeDocument],
        max_results: int,
    ) -> list[NoodleRagSource]:
        web_query_parts = [query]
        web_query_parts.extend(_AGENT_EXPANSION_TERMS[request.agent][:5])
        if request.architecture_context is not None:
            web_query_parts.append(request.architecture_context.system_design or request.architecture_context.summary)
        if request.pipeline_document is not None:
            web_query_parts.append(
                " ".join(node.label for node in request.pipeline_document.nodes[:5])
            )
        web_query = " ".join(part for part in web_query_parts if part).strip()

        web_documents = [*self._web_documents, *documents]
        web_sources = self._rank_sources(web_documents, web_query, max_results)
        for source in web_sources:
            if source.kind != "web_search":
                source.kind = "web_search"
        return web_sources

    @staticmethod
    def _merge_ranked_sources(
        ranked_sources: list[NoodleRagSource],
        new_sources: list[NoodleRagSource],
        max_results: int,
    ) -> list[NoodleRagSource]:
        deduped: dict[str, NoodleRagSource] = {}
        for source in [*ranked_sources, *new_sources]:
            current = deduped.get(source.id)
            if current is None or source.score > current.score:
                deduped[source.id] = source
        merged = sorted(deduped.values(), key=lambda item: item.score, reverse=True)
        return merged[:max_results]

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

    def _regenerate_query(self, request: NoodleAgentQueryRequest, answer: str) -> str:
        focus_parts = [
            request.user_turn,
            "answer quality",
            "direct response",
            "grounded context",
            " ".join(_AGENT_EXPANSION_TERMS[request.agent][:4]),
        ]
        answer_tokens = list(self._tokenize(answer))
        if answer_tokens:
            focus_parts.append(" ".join(answer_tokens[:8]))
        if request.context_blocks:
            focus_parts.append(" ".join(request.context_blocks[:2]))
        return " ".join(part for part in focus_parts if part).strip()

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
