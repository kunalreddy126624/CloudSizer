from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Pipeline, PipelineVersion


class PipelineRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_pipelines(self) -> list[Pipeline]:
        return list(self.session.scalars(select(Pipeline).order_by(Pipeline.created_at.desc())))

    def get_pipeline(self, pipeline_id: str) -> Pipeline | None:
        return self.session.get(Pipeline, pipeline_id)

    def create_pipeline(self, pipeline: Pipeline, version: PipelineVersion) -> Pipeline:
        self.session.add(pipeline)
        self.session.add(version)
        self.session.commit()
        self.session.refresh(pipeline)
        return pipeline

    def update_pipeline(self, pipeline: Pipeline) -> Pipeline:
        self.session.add(pipeline)
        self.session.commit()
        self.session.refresh(pipeline)
        return pipeline

    def create_pipeline_version(self, version: PipelineVersion) -> PipelineVersion:
        self.session.add(version)
        self.session.commit()
        self.session.refresh(version)
        return version

    def list_pipeline_versions(self, pipeline_id: str) -> list[PipelineVersion]:
        stmt = select(PipelineVersion).where(PipelineVersion.pipeline_id == pipeline_id).order_by(PipelineVersion.version.desc())
        return list(self.session.scalars(stmt))
