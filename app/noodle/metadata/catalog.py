from __future__ import annotations

from app.noodle.config import NoodleSettings


class MetadataCatalogService:
    def __init__(self, settings: NoodleSettings) -> None:
        self.settings = settings

    def stack(self) -> list[str]:
        return [
            self.settings.metadata_backend,
            "openlineage",
            "schema-registry",
            "business-glossary",
        ]

    def lakehouse_layout(self) -> dict[str, list[str]]:
        return {
            "bronze": ["raw immutable ingest", "source-native retention", "replay support"],
            "silver": ["standardized schemas", "quality checks", "privacy controls"],
            "gold": ["domain products", "semantic metrics", "bi-ready tables"],
            "feature_store": ["offline training sets", "online feature projections"],
            "serving": ["api marts", "reverse etl", "agent-ready views"],
        }

