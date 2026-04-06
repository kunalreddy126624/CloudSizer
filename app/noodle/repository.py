from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

from app.noodle.schemas import NoodlePipelineDocument


class NoodlePipelineRepository:
    def __init__(self, storage_path: str | Path = "app/data/noodle_pipelines.json") -> None:
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def list_pipelines(self) -> list[NoodlePipelineDocument]:
        payload = self._read_all()
        return [NoodlePipelineDocument.model_validate(item) for item in payload]

    def get_pipeline(self, pipeline_id: str) -> NoodlePipelineDocument | None:
        for pipeline in self.list_pipelines():
            if pipeline.id == pipeline_id:
                return pipeline
        return None

    def save_pipeline(self, document: NoodlePipelineDocument) -> NoodlePipelineDocument:
        with self._lock:
            documents = self._read_all()
            next_payload = [item for item in documents if item.get("id") != document.id]
            next_payload.insert(0, document.model_dump(mode="json"))
            self._write_all(next_payload)
        return document

    def _read_all(self) -> list[dict[str, object]]:
        if not self.storage_path.exists():
            return []
        try:
            raw = json.loads(self.storage_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
        if isinstance(raw, list):
            return [item for item in raw if isinstance(item, dict)]
        return []

    def _write_all(self, payload: list[dict[str, object]]) -> None:
        self.storage_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
