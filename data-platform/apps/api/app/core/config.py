from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SQLITE_PATH = (Path(__file__).resolve().parents[2] / "data" / "data_platform.db").resolve()


class Settings(BaseSettings):
    app_name: str = "Data Platform API"
    api_prefix: str = "/"
    database_url: str = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
    redis_url: str = "redis://localhost:6379/0"
    storage_endpoint: str = "http://localhost:9000"
    storage_bucket: str = "artifacts"
    cors_origins: list[str] = ["http://localhost:3000"]
    seed_workspace_slug: str = "acme"

    model_config = SettingsConfigDict(env_prefix="DP_", env_file=".env", extra="ignore")

    @property
    def sqlite_path(self) -> Path:
        if not self.database_url.startswith("sqlite:///"):
            return DEFAULT_SQLITE_PATH
        return Path(self.database_url.removeprefix("sqlite:///"))


settings = Settings()
