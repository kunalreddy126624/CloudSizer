from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.entities import Artifact, ArtifactVersion, Connection, Environment, Pipeline, PipelineVersion, Repo, User, Workspace


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        existing = session.scalar(select(Workspace).where(Workspace.id == "ws_acme"))
        if existing:
            return

        workspace = Workspace(id="ws_acme", name="Acme", slug="acme")
        user = User(id="usr_demo", email="demo@acme.io", display_name="Demo User")
        repo = Repo(
            id="repo_analytics",
            workspace_id=workspace.id,
            name="analytics-platform",
            slug="analytics-platform",
            description="Core analytics workspace repository.",
            root_path="workspaces/acme/repos/analytics-platform",
        )
        artifact = Artifact(
            id="art_daily_sales",
            repo_id=repo.id,
            parent_path="pipelines",
            name="daily_sales.pipeline.json",
            path="workspaces/acme/repos/analytics-platform/pipelines/daily_sales.pipeline.json",
            artifact_type="pipeline",
            publish_state="draft",
            latest_version=1,
        )

        example_path = Path(__file__).resolve().parents[3] / "packages" / "types" / "schemas" / "example-pipeline.json"
        spec = json.loads(example_path.read_text(encoding="utf-8"))

        artifact_version = ArtifactVersion(
            id="arv_daily_sales_v1",
            artifact_id=artifact.id,
            version=1,
            content=json.dumps(spec, indent=2),
            metadata_json={"title": "Daily sales", "language": "json"},
            publish_state="draft",
        )
        pipeline = Pipeline(
            id="pl_daily_sales",
            artifact_id=artifact.id,
            name="Daily Sales Pipeline",
            description="Extracts daily sales, transforms records, and loads Snowflake.",
            publish_state="draft",
            current_version=1,
            spec_json=spec,
        )
        pipeline_version = PipelineVersion(
            id="plv_daily_sales_v1",
            pipeline_id=pipeline.id,
            version=1,
            publish_state="draft",
            spec_json=spec,
        )
        connection = Connection(
            id="conn_postgres_finance",
            workspace_id=workspace.id,
            name="Finance Postgres",
            connection_type="postgres",
            config_json={"host": "postgres", "port": 5432, "database": "finance"},
        )
        environment = Environment(
            id="env_dev",
            workspace_id=workspace.id,
            name="Development",
            slug="development",
            is_default=True,
        )

        session.add_all([workspace, user, repo, artifact, artifact_version, pipeline, pipeline_version, connection, environment])
        session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    seed()
