import json
import re
from pathlib import Path

from app.allocator.config import AllocatorSettings
from app.allocator.schemas import TerraformBundle, TerraformBundleFile
from app.models import CloudProvider, ResourceAllocatorRequest


PROVIDER_SOURCE: dict[CloudProvider, str] = {
    CloudProvider.AWS: "hashicorp/aws",
    CloudProvider.AZURE: "hashicorp/azurerm",
    CloudProvider.GCP: "hashicorp/google",
    CloudProvider.ORACLE: "oracle/oci",
    CloudProvider.ALIBABA: "aliyun/alicloud",
    CloudProvider.IBM: "IBM-Cloud/ibm",
    CloudProvider.TENCENT: "tencentcloudstack/tencentcloud",
    CloudProvider.DIGITALOCEAN: "digitalocean/digitalocean",
    CloudProvider.AKAMAI: "linode/linode",
    CloudProvider.OVHCLOUD: "ovh/ovh",
    CloudProvider.CLOUDFLARE: "cloudflare/cloudflare",
    CloudProvider.SALESFORCE: "salesforce/salesforce",
    CloudProvider.SNOWFLAKE: "Snowflake-Labs/snowflake",
}


class TerraformTemplateEngine:
    def __init__(self, settings: AllocatorSettings) -> None:
        self.settings = settings

    def build_bundle(self, request: ResourceAllocatorRequest) -> TerraformBundle:
        providers = self._resolve_providers(request)
        modules = ["network", "identity", "data", "workload"]
        files = [
            TerraformBundleFile(path="providers.tf", content=self._render_provider_block(providers)),
            TerraformBundleFile(path="variables.tf", content=self._render_variables_block()),
            TerraformBundleFile(path="main.tf", content=self._render_main_block(request)),
            TerraformBundleFile(path="outputs.tf", content=self._render_outputs_block()),
            TerraformBundleFile(
                path="terraform.tfvars.json",
                content=json.dumps(
                    {
                        "project": request.deployment_request.project,
                        "environment": request.deployment_request.env.value,
                        "owner": request.deployment_request.owner,
                        "region": request.deployment_request.region,
                    },
                    indent=2,
                ),
            ),
        ]
        return TerraformBundle(modules=modules, files=files)

    def stage_bundle(self, run_id: int, bundle: TerraformBundle) -> Path:
        destination = self.settings.terraform_artifact_dir / f"run-{run_id}"
        destination.mkdir(parents=True, exist_ok=True)
        for terraform_file in bundle.files:
            path = destination / terraform_file.path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(terraform_file.content, encoding="utf-8")
        return destination

    def _render_provider_block(self, providers: list[CloudProvider]) -> str:
        required_provider_lines = "\n".join(
            (
                f"    {provider.value} = {{\n"
                f"      source  = \"{PROVIDER_SOURCE[provider]}\"\n"
                "      version = \">= 1.0.0\"\n"
                "    }"
            )
            for provider in providers
        )
        provider_blocks = "\n\n".join(
            (
                f"provider \"{provider.value}\" {{\n"
                "  region = var.region\n"
                "}"
            )
            for provider in providers
        )
        return f"""terraform {{
  required_version = ">= 1.6.0"

  required_providers {{
{required_provider_lines}
  }}
}}

{provider_blocks}
"""

    def _render_variables_block(self) -> str:
        return """variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "owner" {
  type = string
}

variable "region" {
  type = string
}
"""

    def _render_main_block(self, request: ResourceAllocatorRequest) -> str:
        service_blocks = "\n\n".join(
            self._render_service(
                index,
                service.provider.value if service.provider is not None else request.approved_estimation.recommended_provider.value,
                service.name,
                service.purpose,
                service.estimated_monthly_cost_usd,
            )
            for index, service in enumerate(request.approved_estimation.approved_services or [], start=1)
        )
        if not service_blocks:
            service_blocks = self._render_service(
                1,
                request.approved_estimation.recommended_provider.value,
                f"{request.architecture_type} baseline",
                "Approved estimate placeholder",
                request.approved_estimation.estimated_monthly_cost_usd or 0.0,
            )

        tags = {
            "project": request.deployment_request.project,
            "env": request.deployment_request.env.value,
            "owner": request.deployment_request.owner,
            **request.deployment_request.additional_tags,
        }
        tag_lines = "\n".join(
            f'    {json.dumps(key)} = {json.dumps(value)}'
            for key, value in sorted(tags.items())
        )
        architecture_slug = re.sub(r"[^a-z0-9]+", "_", request.architecture_type.lower()).strip("_") or "workload"
        return f"""locals {{
  architecture_type = "{architecture_slug}"
  default_tags = {{
{tag_lines}
  }}
}}

resource "terraform_data" "allocator_metadata" {{
  input = {{
    architecture_type = local.architecture_type
    default_tags      = local.default_tags
  }}
}}

{service_blocks}
"""

    def _render_outputs_block(self) -> str:
        return """output "allocator_metadata" {
  value = terraform_data.allocator_metadata.input
}
"""

    def _render_service(self, index: int, provider: str, name: str, purpose: str, cost: float) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or f"service_{index}"
        return f"""resource "terraform_data" "{slug}" {{
  input = {{
    provider                   = {json.dumps(provider)}
    service_name               = {json.dumps(name)}
    purpose                    = {json.dumps(purpose)}
    estimated_monthly_cost_usd = {round(cost, 2)}
  }}
}}"""

    def _resolve_providers(self, request: ResourceAllocatorRequest) -> list[CloudProvider]:
        providers = {
            service.provider
            for service in request.approved_estimation.approved_services
            if service.provider is not None
        }
        if not providers:
            providers.add(request.approved_estimation.recommended_provider)
        return sorted(providers, key=lambda item: item.value)
