from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AppSettings:
    environment: str
    bootstrap_legacy_demo_user: bool
    bootstrap_rbac_admin_user: bool
    legacy_demo_email: str
    legacy_demo_name: str
    legacy_demo_password: str
    rbac_admin_email: str
    rbac_admin_name: str
    rbac_admin_password: str


@lru_cache(maxsize=1)
def get_app_settings() -> AppSettings:
    environment = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")).strip().lower()
    is_local_environment = environment in {"development", "dev", "test", "local"}
    return AppSettings(
        environment=environment,
        bootstrap_legacy_demo_user=_read_bool("BOOTSTRAP_LEGACY_DEMO_USER", is_local_environment),
        bootstrap_rbac_admin_user=_read_bool("BOOTSTRAP_RBAC_ADMIN_USER", is_local_environment),
        legacy_demo_email=os.getenv("LEGACY_DEMO_EMAIL", "demo@cloudsizer.local"),
        legacy_demo_name=os.getenv("LEGACY_DEMO_NAME", "CloudSizer Demo"),
        legacy_demo_password=os.getenv("LEGACY_DEMO_PASSWORD", "CloudSizer123!"),
        rbac_admin_email=os.getenv("RBAC_ADMIN_EMAIL", "admin@cloudsizer.local"),
        rbac_admin_name=os.getenv("RBAC_ADMIN_NAME", "CloudSizer Admin"),
        rbac_admin_password=os.getenv("RBAC_ADMIN_PASSWORD", "CloudSizer123!"),
    )
