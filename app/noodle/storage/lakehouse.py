from __future__ import annotations

from app.noodle.config import NoodleSettings


class LakehouseArchitectureService:
    def __init__(self, settings: NoodleSettings) -> None:
        self.settings = settings

    def stack(self) -> list[str]:
        return [
            f"{self.settings.lakehouse_format}-tables",
            "object-storage",
            "trino-query-plane",
            "warehouse-acceleration-layer",
        ]

