import re
import time
from uuid import uuid4

from app.allocator.config import AllocatorSettings
from app.allocator.schemas import CloudAccountPlan
from app.models import CloudProvider, ResourceAllocatorRequest


PROVIDER_SCOPE_KIND: dict[CloudProvider, str] = {
    CloudProvider.AWS: "organization_account",
    CloudProvider.AZURE: "subscription",
    CloudProvider.GCP: "project",
    CloudProvider.ORACLE: "compartment",
    CloudProvider.ALIBABA: "resource_account",
    CloudProvider.IBM: "resource_group",
    CloudProvider.TENCENT: "organization_account",
    CloudProvider.DIGITALOCEAN: "team",
    CloudProvider.AKAMAI: "linode_account",
    CloudProvider.OVHCLOUD: "project",
    CloudProvider.CLOUDFLARE: "account",
    CloudProvider.SALESFORCE: "org",
    CloudProvider.SNOWFLAKE: "account",
}


class CloudControlPlaneService:
    def __init__(self, settings: AllocatorSettings) -> None:
        self.settings = settings

    def plan_account(self, request: ResourceAllocatorRequest) -> CloudAccountPlan:
        provider = self._resolve_primary_provider(request)
        deployment = request.deployment_request
        default_name = deployment.account_name or f"{deployment.project}-{deployment.env.value}"
        scope = PROVIDER_SCOPE_KIND[provider]
        if deployment.existing_account_id and not deployment.requires_new_account:
            return CloudAccountPlan(
                provider=provider,
                reuse_existing=True,
                resource_kind=scope,
                account_name=default_name,
                organizational_unit=deployment.parent_org_unit or request.organization_context.default_parent_org_unit or "shared",
                billing_scope=request.organization_context.billing_scope,
                account_email=self._derive_account_email(deployment.project, deployment.env.value, deployment.owner),
                existing_account_id=deployment.existing_account_id,
                rationale=f"The request reuses an existing {scope}.",
            )

        return CloudAccountPlan(
            provider=provider,
            reuse_existing=False,
            resource_kind=scope,
            account_name=default_name,
            organizational_unit=deployment.parent_org_unit or request.organization_context.default_parent_org_unit or "platform",
            billing_scope=request.organization_context.billing_scope,
            account_email=self._derive_account_email(deployment.project, deployment.env.value, deployment.owner),
            rationale=f"A dedicated {scope} is required for the requested workload.",
        )

    def provision_account(self, plan: CloudAccountPlan) -> CloudAccountPlan:
        if plan.reuse_existing:
            return plan

        if self.settings.mock_cloud_control_plane or plan.provider != CloudProvider.AWS:
            identifier = f"{plan.provider.value}-{uuid4().hex[:10]}"
            return plan.model_copy(
                update={
                    "target_account_id": identifier,
                    "target_account_arn": f"{plan.provider.value}://{plan.resource_kind}/{identifier}",
                    "provisioning_reference": f"{plan.provider.value}-provision-{uuid4().hex[:8]}",
                }
            )

        return self._create_aws_account(plan)

    def _create_aws_account(self, plan: CloudAccountPlan) -> CloudAccountPlan:
        try:
            import boto3  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError("boto3 is required for live AWS Organizations integration.") from exc

        client = boto3.client("organizations", region_name=self.settings.aws_region)
        response = client.create_account(
            Email=plan.account_email or self._derive_account_email(plan.account_name, "prod", "owner"),
            AccountName=plan.account_name,
            RoleName="OrganizationAccountAccessRole",
        )
        request_id = response["CreateAccountStatus"]["Id"]
        deadline = time.time() + 180
        while time.time() < deadline:
            status = client.describe_create_account_status(CreateAccountRequestId=request_id)["CreateAccountStatus"]
            if status["State"] == "SUCCEEDED":
                account_id = status["AccountId"]
                return plan.model_copy(
                    update={
                        "target_account_id": account_id,
                        "target_account_arn": f"arn:aws:organizations::{account_id}:account/o-live/{account_id}",
                        "provisioning_reference": request_id,
                    }
                )
            if status["State"] == "FAILED":
                raise RuntimeError(status.get("FailureReason", "AWS Organizations account creation failed."))
            time.sleep(3)
        raise RuntimeError("AWS Organizations account creation timed out.")

    def _derive_account_email(self, project: str, env: str, owner: str) -> str:
        owner_slug = re.sub(r"[^a-z0-9]+", ".", owner.lower()).strip(".") or "owner"
        project_slug = re.sub(r"[^a-z0-9]+", "-", project.lower()).strip("-") or "project"
        return f"{project_slug}-{env}-{owner_slug}@{self.settings.default_account_email_domain}"

    def _resolve_primary_provider(self, request: ResourceAllocatorRequest) -> CloudProvider:
        for service in request.approved_estimation.approved_services:
            if service.provider and self._is_compute_service(service.name, service.purpose):
                return service.provider
        for service in request.approved_estimation.approved_services:
            if service.provider:
                return service.provider
        return request.approved_estimation.recommended_provider

    def _is_compute_service(self, name: str, purpose: str) -> bool:
        label = f"{name} {purpose}".lower()
        return any(
            keyword in label
            for keyword in ("compute", "container", "kubernetes", "runtime", "app", "workers", "vm", "instance")
        )
