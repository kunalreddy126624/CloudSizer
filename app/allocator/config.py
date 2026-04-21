from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class AllocatorSettings:
    database_url: str
    audit_retention_days: int
    default_currency: str
    terraform_state_bucket: str
    terraform_artifact_dir: Path
    terraform_binary: str
    terraform_apply_timeout_seconds: int
    aws_region: str
    default_account_email_domain: str
    mock_cloud_control_plane: bool
    mock_terraform_apply: bool
    approval_required: bool
    redis_url: str | None


def get_allocator_settings() -> AllocatorSettings:
    artifact_dir = Path(
        os.getenv("ALLOCATOR_TERRAFORM_ARTIFACT_DIR", "app/data/allocator_artifacts")
    )
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return AllocatorSettings(
        database_url=os.getenv("ALLOCATOR_DATABASE_URL", "sqlite:///app/data/allocator_agent.db"),
        audit_retention_days=int(os.getenv("ALLOCATOR_AUDIT_RETENTION_DAYS", "90")),
        default_currency=os.getenv("ALLOCATOR_DEFAULT_CURRENCY", "USD"),
        terraform_state_bucket=os.getenv("ALLOCATOR_TERRAFORM_STATE_BUCKET", "cloudsizer-terraform-state"),
        terraform_artifact_dir=artifact_dir,
        terraform_binary=os.getenv("ALLOCATOR_TERRAFORM_BINARY", "terraform"),
        terraform_apply_timeout_seconds=int(
            os.getenv("ALLOCATOR_TERRAFORM_APPLY_TIMEOUT_SECONDS", "900")
        ),
        aws_region=os.getenv("AWS_REGION", "us-east-1"),
        default_account_email_domain=os.getenv("ALLOCATOR_ACCOUNT_EMAIL_DOMAIN", "allocator.local"),
        mock_cloud_control_plane=(
            os.getenv("ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE")
            or os.getenv("ALLOCATOR_MOCK_AWS", "true")
        ).lower()
        == "true",
        mock_terraform_apply=os.getenv("ALLOCATOR_MOCK_TERRAFORM_APPLY", "false").lower() == "true",
        approval_required=os.getenv("ALLOCATOR_APPROVAL_REQUIRED", "true").lower() == "true",
        redis_url=os.getenv("REDIS_URL"),
    )
