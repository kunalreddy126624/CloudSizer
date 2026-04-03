from dataclasses import dataclass
import os


@dataclass(frozen=True)
class RbacSettings:
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_expiry_minutes: int
    issuer: str
    audience: str


def get_rbac_settings() -> RbacSettings:
    return RbacSettings(
        database_url=os.getenv("RBAC_DATABASE_URL", "sqlite:///app/data/cloudsizer_rbac.db"),
        jwt_secret=os.getenv("RBAC_JWT_SECRET", "change-me-in-production-32-char-secret"),
        jwt_algorithm=os.getenv("RBAC_JWT_ALGORITHM", "HS256"),
        access_token_expiry_minutes=int(os.getenv("RBAC_ACCESS_TOKEN_EXPIRY_MINUTES", "60")),
        issuer=os.getenv("RBAC_JWT_ISSUER", "cloudsizer"),
        audience=os.getenv("RBAC_JWT_AUDIENCE", "cloudsizer-api"),
    )
