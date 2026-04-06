from __future__ import annotations

import uuid

from app.models.entities import Pipeline, PipelineVersion
from app.repositories.pipeline_repository import PipelineRepository
from app.schemas.pipeline import PipelineCreate, PipelineRead, PipelineSpec, PipelineUpdate, ValidationIssue
from app.services.validation_service import ValidationService


def _pipeline_to_read(pipeline: Pipeline) -> PipelineRead:
    return PipelineRead(
        id=pipeline.id,
        artifact_id=pipeline.artifact_id,
        name=pipeline.name,
        description=pipeline.description,
        publish_state=pipeline.publish_state,
        current_version=pipeline.current_version,
        spec=PipelineSpec.model_validate(pipeline.spec_json),
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
    )


class PipelineService:
    def __init__(self, repository: PipelineRepository, validation_service: ValidationService) -> None:
        self.repository = repository
        self.validation_service = validation_service

    def list_pipelines(self) -> list[PipelineRead]:
        return [_pipeline_to_read(pipeline) for pipeline in self.repository.list_pipelines()]

    def create_pipeline(self, payload: PipelineCreate) -> PipelineRead:
        pipeline = Pipeline(
            id=f"pl_{uuid.uuid4().hex[:12]}",
            artifact_id=payload.artifact_id,
            name=payload.name,
            description=payload.description,
            publish_state=payload.publish_state,
            current_version=payload.current_version,
            spec_json=payload.spec.model_dump(mode="json"),
        )
        version = PipelineVersion(
            id=f"plv_{uuid.uuid4().hex[:12]}",
            pipeline_id=pipeline.id,
            version=payload.current_version,
            publish_state=payload.publish_state,
            spec_json=payload.spec.model_dump(mode="json"),
        )
        return _pipeline_to_read(self.repository.create_pipeline(pipeline, version))

    def get_pipeline(self, pipeline_id: str) -> PipelineRead:
        pipeline = self.repository.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError("Pipeline not found")
        return _pipeline_to_read(pipeline)

    def update_pipeline(self, pipeline_id: str, payload: PipelineUpdate) -> PipelineRead:
        pipeline = self.repository.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError("Pipeline not found")

        pipeline.name = payload.name
        pipeline.description = payload.description
        pipeline.current_version += 1
        pipeline.spec_json = payload.spec.model_dump(mode="json")

        self.repository.update_pipeline(pipeline)
        self.repository.create_pipeline_version(
            PipelineVersion(
                id=f"plv_{uuid.uuid4().hex[:12]}",
                pipeline_id=pipeline.id,
                version=pipeline.current_version,
                publish_state=pipeline.publish_state,
                spec_json=pipeline.spec_json,
            )
        )
        return _pipeline_to_read(pipeline)

    def validate_pipeline(self, pipeline_id: str) -> list[ValidationIssue]:
        pipeline = self.repository.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError("Pipeline not found")
        return self.validation_service.validate(PipelineSpec.model_validate(pipeline.spec_json))

    def publish_pipeline(self, pipeline_id: str) -> PipelineRead:
        pipeline = self.repository.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError("Pipeline not found")
        issues = self.validation_service.validate(PipelineSpec.model_validate(pipeline.spec_json))
        if any(issue.severity == "error" for issue in issues):
            raise RuntimeError("Pipeline has validation errors")

        pipeline.publish_state = "published"
        self.repository.update_pipeline(pipeline)
        self.repository.create_pipeline_version(
            PipelineVersion(
                id=f"plv_{uuid.uuid4().hex[:12]}",
                pipeline_id=pipeline.id,
                version=pipeline.current_version,
                publish_state="published",
                spec_json=pipeline.spec_json,
            )
        )
        return _pipeline_to_read(pipeline)
