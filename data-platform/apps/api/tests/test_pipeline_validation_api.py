from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import engine
from app.main import app
from app.seed import seed


def setup_module() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed()


def test_validate_pipeline_endpoint_returns_success() -> None:
    client = TestClient(app)
    response = client.post("/pipelines/pl_daily_sales/validate")
    assert response.status_code == 200
    assert response.json() == []


def test_validate_pipeline_endpoint_returns_issues_for_invalid_pipeline() -> None:
    example_path = Path(__file__).resolve().parents[3] / "packages" / "types" / "schemas" / "example-pipeline.json"
    spec = json.loads(example_path.read_text(encoding="utf-8"))
    spec["nodes"][0]["config"]["connectionId"] = ""

    client = TestClient(app)
    create_response = client.post(
        "/pipelines",
        json={
            "artifact_id": "art_daily_sales",
            "name": "Invalid Pipeline",
            "description": "invalid",
            "publish_state": "draft",
            "current_version": 1,
            "spec": spec,
        },
    )
    assert create_response.status_code == 201

    pipeline_id = create_response.json()["id"]
    validate_response = client.post(f"/pipelines/{pipeline_id}/validate")
    assert validate_response.status_code == 200
    assert any(issue["code"] == "missing_required_config" for issue in validate_response.json())


def test_list_pipeline_runs_returns_404_for_unknown_pipeline() -> None:
    client = TestClient(app)
    response = client.get("/pipelines/pl_missing/runs")
    assert response.status_code == 404
    assert response.json()["detail"] == "Pipeline not found"
