import json
import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.models import (
    AccountStrategyAction,
    AllocatorAccountDetails,
    AllocatorAccountStrategy,
    AllocatorCostEstimate,
    AllocatorDeploymentRequest,
    AllocatorIamPlan,
    AllocatorInfrastructurePlan,
    AllocatorNetworkingPlan,
    AllocatorOrganizationContext,
    AllocatorPlannedService,
    AllocatorPolicyValidation,
    AllocatorProvisioning,
    AllocatorStatus,
    AllocatorTerraformBundle,
    AllocatorTerraformFile,
    AllocatorToolContract,
    AllocatorToolRun,
    ApplyTerraformToolInput,
    ApplyTerraformToolOutput,
    ApprovedEstimationInput,
    CloudProvider,
    CreateCloudAccountToolInput,
    CreateCloudAccountToolOutput,
    EstimateCostToolInput,
    EstimateCostToolOutput,
    GenerateTerraformToolInput,
    GenerateTerraformToolOutput,
    ResourceAllocatorContractResponse,
    ResourceAllocatorRequest,
    ResourceAllocatorResponse,
    ServiceEstimate,
    ValidatePolicyToolInput,
    ValidatePolicyToolOutput,
)
from app.services.catalog import get_catalog_service
from app.services.pricing import build_architecture


RESOURCE_ALLOCATOR_SYSTEM_PROMPT = """
You are a Cloud Resource Allocator Agent.

Purpose:
Create cloud account plans and infrastructure plans from approved estimations, then provision only after cost, policy, and approval checks pass.

You receive:
- approved_estimation_json
- budget_constraints
- architecture_type
- organization_context
- deployment_request

Input requirements:
- approved_estimation_json must be finalized and approved
- budget_constraints must include currency and max_monthly_cost
- organization_context must include org/account vending settings, allowed clouds, billing model, tagging policy, IAM boundaries, and network guardrails
- deployment_request must include env, region, owner, project, and whether public ingress is explicitly required
- if account creation is requested, deployment_request must include account_name, account_purpose, and parent_org_unit

Your responsibilities:
1. Convert estimation into an infrastructure plan
2. Decide whether to use an existing cloud account/project/subscription or create a new one
3. Create an account vending plan when a new account is required
4. Choose appropriate cloud services
5. Generate Terraform configuration
6. Validate policy, security, networking, IAM, and tagging
7. Estimate cost and compare against budget
8. Trigger provisioning ONLY after all validations and explicit approval pass

Core rules:
- Always prefer managed services over self-managed infrastructure
- Avoid over-provisioning
- Enforce mandatory tags: project, env, owner
- Never expose public resources unless deployment_request.public_ingress_required is true
- Follow least privilege IAM
- Use private networking by default
- Do not create or use root credentials
- For new cloud accounts, use only approved organization account-vending workflows
- Do not provision if required org, billing, network, or security baselines are missing
- Do not apply Terraform if cost exceeds budget
- If any validation fails, stop and return structured failure output
""".strip()


PROVIDER_TERRAFORM_SOURCES: dict[CloudProvider, str] = {
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


def get_resource_allocator_contracts() -> ResourceAllocatorContractResponse:
    return ResourceAllocatorContractResponse(
        system_prompt=RESOURCE_ALLOCATOR_SYSTEM_PROMPT,
        tool_contracts=[
            _build_tool_contract(
                "create_cloud_account",
                "Create a new organization-managed cloud account, subscription, or project with inherited guardrails.",
                CreateCloudAccountToolInput,
                CreateCloudAccountToolOutput,
            ),
            _build_tool_contract(
                "generate_terraform",
                "Generate a Terraform bundle for the planned infrastructure.",
                GenerateTerraformToolInput,
                GenerateTerraformToolOutput,
            ),
            _build_tool_contract(
                "estimate_cost",
                "Estimate the monthly run cost for the planned infrastructure and compare it to budget.",
                EstimateCostToolInput,
                EstimateCostToolOutput,
            ),
            _build_tool_contract(
                "validate_policy",
                "Validate tagging, IAM, network exposure, account governance, and budget policy.",
                ValidatePolicyToolInput,
                ValidatePolicyToolOutput,
            ),
            _build_tool_contract(
                "apply_terraform",
                "Stage the Terraform bundle for provisioning handoff after approval and validation pass.",
                ApplyTerraformToolInput,
                ApplyTerraformToolOutput,
            ),
        ],
        output_schema=ResourceAllocatorResponse.model_json_schema(),
    )


def allocate_cloud_resources(request: ResourceAllocatorRequest) -> ResourceAllocatorResponse:
    provider = request.approved_estimation.recommended_provider
    errors: list[str] = []
    tool_runs: list[AllocatorToolRun] = []
    estimated_cost = round(request.approved_estimation.estimated_monthly_cost_usd or 0.0, 2)
    account_strategy = AllocatorAccountStrategy(
        action=AccountStrategyAction.REUSE_EXISTING,
        reason="Awaiting account strategy resolution.",
        target_cloud=provider,
        account_details=AllocatorAccountDetails(
            account_id=request.deployment_request.existing_account_id,
            billing_scope=request.organization_context.billing_scope,
        ),
    )
    terraform_bundle = AllocatorTerraformBundle(generated=False, modules=[], files=[])
    cost_estimate = AllocatorCostEstimate(
        currency=request.budget_constraints.currency,
        estimated_monthly_cost=estimated_cost,
        budget_limit=request.budget_constraints.max_monthly_cost,
        within_budget=estimated_cost <= request.budget_constraints.max_monthly_cost,
    )
    policy_validation = AllocatorPolicyValidation(passed=False, violations=[])
    provisioning = AllocatorProvisioning(
        applied=False,
        approval_required=not request.deployment_request.approval_to_apply,
        reason="Provisioning not started.",
        execution_mode="bundle_only",
    )

    if not request.approved_estimation.approved:
        errors.append("Approved estimation must be finalized before allocation can run.")
        return ResourceAllocatorResponse(
            status=AllocatorStatus.FAILED,
            summary="Allocation stopped because the estimation is not approved.",
            account_strategy=account_strategy,
            infra_plan=None,
            terraform=terraform_bundle,
            cost_estimate=cost_estimate,
            policy_validation=policy_validation,
            provisioning=provisioning,
            errors=errors,
            tool_runs=tool_runs,
        )

    services = _resolve_approved_services(request.approved_estimation)
    service_providers = _resolve_service_providers(services, provider)
    primary_provider = _resolve_primary_provider(services, provider)
    infra_plan = _build_infrastructure_plan(request, services)

    account_strategy = _decide_account_strategy(
        provider=primary_provider,
        organization_context=request.organization_context,
        deployment_request=request.deployment_request,
    )

    disallowed_providers = sorted(
        [
            cloud.value
            for cloud in service_providers
            if cloud not in request.organization_context.allowed_clouds
        ]
    )
    if disallowed_providers:
        errors.append(
            "The following service providers are not in the organization allowed cloud list: "
            + ", ".join(disallowed_providers)
            + "."
        )

    if account_strategy.action == AccountStrategyAction.CREATE_NEW:
        account_result = _create_cloud_account(
            CreateCloudAccountToolInput(
                target_cloud=primary_provider,
                account_name=request.deployment_request.account_name or f"{request.deployment_request.project}-{request.deployment_request.env.value}",
                account_purpose=request.deployment_request.account_purpose or request.architecture_type,
                parent_org_unit=request.deployment_request.parent_org_unit
                or request.organization_context.default_parent_org_unit
                or "unassigned",
                billing_scope=request.organization_context.billing_scope,
                project=request.deployment_request.project,
                env=request.deployment_request.env,
                owner=request.deployment_request.owner,
            )
        )
        account_strategy = account_strategy.model_copy(
            update={
                "account_details": AllocatorAccountDetails(
                    account_id=account_result.account_id,
                    account_name=account_result.account_name,
                    parent_org_unit=account_result.parent_org_unit,
                    billing_scope=account_result.billing_scope,
                )
            }
        )
        tool_runs.append(
            AllocatorToolRun(
                name="create_cloud_account",
                status="completed",
                detail=f"Prepared organization-managed account {account_result.account_id}.",
            )
        )
    else:
        tool_runs.append(
            AllocatorToolRun(
                name="create_cloud_account",
                status="skipped",
                detail="Existing approved account will be reused.",
            )
        )

    terraform_result = _generate_terraform(
        GenerateTerraformToolInput(
            provider=primary_provider,
            architecture_type=request.architecture_type,
            infra_plan=infra_plan,
        )
    )
    terraform_bundle = AllocatorTerraformBundle(
        generated=True,
        modules=terraform_result.modules,
        files=terraform_result.files,
    )
    tool_runs.append(
        AllocatorToolRun(
            name="generate_terraform",
            status="completed",
            detail=f"Generated {len(terraform_result.files)} Terraform files.",
        )
    )

    cost_result = _estimate_cost(
        EstimateCostToolInput(
            provider=primary_provider,
            services=infra_plan.services,
            budget_constraints=request.budget_constraints,
        ),
        request.approved_estimation,
    )
    cost_estimate = AllocatorCostEstimate(
        currency=cost_result.currency,
        estimated_monthly_cost=cost_result.estimated_monthly_cost,
        budget_limit=request.budget_constraints.max_monthly_cost,
        within_budget=cost_result.within_budget,
    )
    tool_runs.append(
        AllocatorToolRun(
            name="estimate_cost",
            status="completed",
            detail=(
                f"Estimated monthly cost is {cost_result.currency} "
                f"{cost_result.estimated_monthly_cost:.2f}."
            ),
        )
    )

    validation_result = _validate_policy(
        ValidatePolicyToolInput(
            account_strategy=account_strategy,
            infra_plan=infra_plan,
            cost_estimate=cost_estimate,
            organization_context=request.organization_context,
            deployment_request=request.deployment_request,
        )
    )
    policy_validation = AllocatorPolicyValidation(
        passed=validation_result.passed,
        violations=validation_result.violations,
    )
    tool_runs.append(
        AllocatorToolRun(
            name="validate_policy",
            status="completed" if validation_result.passed else "failed",
            detail="Policy validation passed." if validation_result.passed else "; ".join(validation_result.violations),
        )
    )

    if errors or not validation_result.passed:
        errors.extend(validation_result.violations)
        provisioning = provisioning.model_copy(
            update={
                "reason": "Provisioning blocked because one or more validations failed.",
                "approval_required": not request.deployment_request.approval_to_apply,
            }
        )
        return ResourceAllocatorResponse(
            status=AllocatorStatus.FAILED,
            summary="Allocation failed because the request violated one or more provisioning rules.",
            account_strategy=account_strategy,
            infra_plan=infra_plan,
            terraform=terraform_bundle,
            cost_estimate=cost_estimate,
            policy_validation=policy_validation,
            provisioning=provisioning,
            errors=errors,
            tool_runs=tool_runs,
        )

    if not request.deployment_request.approval_to_apply:
        tool_runs.append(
            AllocatorToolRun(
                name="apply_terraform",
                status="skipped",
                detail="Explicit approval_to_apply was not provided.",
            )
        )
        provisioning = provisioning.model_copy(
            update={
                "reason": "All checks passed. Waiting for approval_to_apply before provisioning handoff.",
                "approval_required": True,
            }
        )
        return ResourceAllocatorResponse(
            status=AllocatorStatus.NEEDS_APPROVAL,
            summary="Allocation plan, Terraform, cost, and policy checks passed. Approval is still required to trigger provisioning.",
            account_strategy=account_strategy,
            infra_plan=infra_plan,
            terraform=terraform_bundle,
            cost_estimate=cost_estimate,
            policy_validation=policy_validation,
            provisioning=provisioning,
            errors=[],
            tool_runs=tool_runs,
        )

    apply_result = _apply_terraform(
        ApplyTerraformToolInput(
            terraform=terraform_bundle,
            provider=primary_provider,
            approval_to_apply=True,
            artifact_root=request.organization_context.terraform_artifact_root,
        ),
        request.organization_context,
    )
    tool_runs.append(
        AllocatorToolRun(
            name="apply_terraform",
            status="completed" if apply_result.applied else "failed",
            detail=apply_result.detail,
        )
    )
    provisioning = AllocatorProvisioning(
        applied=apply_result.applied,
        approval_required=False,
        reason=apply_result.detail,
        execution_mode=apply_result.execution_mode,
        artifact_path=apply_result.artifact_path,
    )

    if not apply_result.applied:
        errors.append(apply_result.detail)
        return ResourceAllocatorResponse(
            status=AllocatorStatus.FAILED,
            summary="Validation passed, but provisioning could not be triggered.",
            account_strategy=account_strategy,
            infra_plan=infra_plan,
            terraform=terraform_bundle,
            cost_estimate=cost_estimate,
            policy_validation=policy_validation,
            provisioning=provisioning,
            errors=errors,
            tool_runs=tool_runs,
        )

    return ResourceAllocatorResponse(
        status=AllocatorStatus.SUCCESS,
        summary=(
            f"Approved {primary_provider.value} allocation prepared for {request.deployment_request.project} "
            f"and handed off for provisioning."
        ),
        account_strategy=account_strategy,
        infra_plan=infra_plan,
        terraform=terraform_bundle,
        cost_estimate=cost_estimate,
        policy_validation=policy_validation,
        provisioning=provisioning,
        errors=[],
        tool_runs=tool_runs,
    )


def _build_tool_contract(name: str, description: str, input_model, output_model) -> AllocatorToolContract:
    return AllocatorToolContract(
        name=name,
        description=description,
        input_schema=input_model.model_json_schema(),
        output_schema=output_model.model_json_schema(),
    )


def _resolve_approved_services(approved_estimation: ApprovedEstimationInput) -> list[ServiceEstimate]:
    if approved_estimation.approved_services:
        return approved_estimation.approved_services

    recommendation = build_architecture(
        approved_estimation.baseline_request,
        approved_estimation.recommended_provider,
    )
    return recommendation.services


def _resolve_service_providers(
    services: list[ServiceEstimate],
    fallback_provider: CloudProvider,
) -> set[CloudProvider]:
    providers = {service.provider for service in services if service.provider is not None}
    if not providers:
        providers.add(fallback_provider)
    return providers


def _resolve_primary_provider(
    services: list[ServiceEstimate],
    fallback_provider: CloudProvider,
) -> CloudProvider:
    for service in services:
        if service.provider is not None and _is_compute_service(service):
            return service.provider
    for service in services:
        if service.provider is not None:
            return service.provider
    return fallback_provider


def _decide_account_strategy(
    provider: CloudProvider,
    organization_context: AllocatorOrganizationContext,
    deployment_request: AllocatorDeploymentRequest,
) -> AllocatorAccountStrategy:
    if deployment_request.existing_account_id:
        return AllocatorAccountStrategy(
            action=AccountStrategyAction.REUSE_EXISTING,
            reason="The request named an existing approved account for reuse.",
            target_cloud=provider,
            account_details=AllocatorAccountDetails(
                account_id=deployment_request.existing_account_id,
                billing_scope=organization_context.billing_scope,
            ),
        )

    if deployment_request.requires_new_account or deployment_request.env.value == "prod":
        return AllocatorAccountStrategy(
            action=AccountStrategyAction.CREATE_NEW,
            reason="A dedicated account is required for isolation, billing, or production governance.",
            target_cloud=provider,
            account_details=AllocatorAccountDetails(
                account_name=deployment_request.account_name,
                parent_org_unit=deployment_request.parent_org_unit or organization_context.default_parent_org_unit,
                billing_scope=organization_context.billing_scope,
            ),
        )

    fallback_account = organization_context.approved_account_ids[0] if organization_context.approved_account_ids else None
    return AllocatorAccountStrategy(
        action=AccountStrategyAction.REUSE_EXISTING,
        reason="The workload can run inside an existing governed account.",
        target_cloud=provider,
        account_details=AllocatorAccountDetails(
            account_id=fallback_account,
            billing_scope=organization_context.billing_scope,
        ),
    )


def _create_cloud_account(request: CreateCloudAccountToolInput) -> CreateCloudAccountToolOutput:
    normalized_name = _slugify(request.account_name)
    account_id = f"{request.target_cloud.value}-{normalized_name}-{uuid4().hex[:8]}"
    return CreateCloudAccountToolOutput(
        account_id=account_id,
        account_name=request.account_name,
        parent_org_unit=request.parent_org_unit,
        billing_scope=request.billing_scope,
        status="provisioning_ready",
    )


def _build_infrastructure_plan(
    request: ResourceAllocatorRequest,
    services: list[ServiceEstimate],
) -> AllocatorInfrastructurePlan:
    tags = {
        "project": request.deployment_request.project,
        "env": request.deployment_request.env.value,
        "owner": request.deployment_request.owner,
        **request.deployment_request.additional_tags,
    }
    planned_services = [
        AllocatorPlannedService(
            provider=service.provider or request.approved_estimation.recommended_provider,
            service_code=service.service_code,
            service_name=service.name,
            purpose=service.purpose,
            category=_infer_service_category(
                service.provider or request.approved_estimation.recommended_provider,
                service,
            ),
            estimated_monthly_cost_usd=service.estimated_monthly_cost_usd,
            managed=_is_managed_service(service),
            public=request.deployment_request.public_ingress_required
            and _is_public_service_candidate(service),
        )
        for service in services
    ]

    connectivity = ["private subnets", "service-to-service IAM", "centralized logging"]
    if request.deployment_request.public_ingress_required:
        connectivity.insert(0, "public edge ingress")
    else:
        connectivity.insert(0, "internal-only ingress")

    return AllocatorInfrastructurePlan(
        architecture_type=request.architecture_type,
        region=request.deployment_request.region,
        services=planned_services,
        networking=AllocatorNetworkingPlan(
            region=request.deployment_request.region,
            public_ingress=request.deployment_request.public_ingress_required,
            private_network=True,
            connectivity=connectivity,
        ),
        iam=AllocatorIamPlan(
            boundary_name=request.organization_context.iam_boundary_name,
            roles=[
                "workload-execution",
                "managed-service-access",
                "read-only-observability",
            ],
            least_privilege=True,
        ),
        tags=tags,
    )


def _estimate_cost(
    request: EstimateCostToolInput,
    approved_estimation: ApprovedEstimationInput,
) -> EstimateCostToolOutput:
    service_total = round(sum(service.estimated_monthly_cost_usd for service in request.services), 2)
    approved_total = round(approved_estimation.estimated_monthly_cost_usd or 0.0, 2)
    estimated_monthly_cost = max(service_total, approved_total)
    return EstimateCostToolOutput(
        estimated_monthly_cost=estimated_monthly_cost,
        within_budget=estimated_monthly_cost <= request.budget_constraints.max_monthly_cost,
        currency=request.budget_constraints.currency,
    )


def _validate_policy(request: ValidatePolicyToolInput) -> ValidatePolicyToolOutput:
    violations: list[str] = []
    required_tags = set(request.organization_context.tagging_policy)
    missing_tags = sorted(tag for tag in required_tags if not request.infra_plan.tags.get(tag))
    if missing_tags:
        violations.append(f"Missing required tags: {', '.join(missing_tags)}.")

    if request.account_strategy.target_cloud not in request.organization_context.allowed_clouds:
        violations.append(
            f"Cloud {request.account_strategy.target_cloud.value} is not allowed by organization policy."
        )
    service_providers = sorted(
        {
            service.provider
            for service in request.infra_plan.services
            if service.provider is not None
        },
        key=lambda item: item.value,
    )
    disallowed_service_providers = [
        provider.value
        for provider in service_providers
        if provider not in request.organization_context.allowed_clouds
    ]
    if disallowed_service_providers:
        violations.append(
            "Service providers blocked by organization policy: "
            + ", ".join(disallowed_service_providers)
            + "."
        )

    if request.account_strategy.action == AccountStrategyAction.CREATE_NEW:
        if not request.organization_context.account_vending_enabled:
            violations.append("Account vending is disabled for this organization context.")
        if not request.account_strategy.account_details.parent_org_unit:
            violations.append("New accounts require a parent organization unit.")

    if (
        request.account_strategy.action == AccountStrategyAction.REUSE_EXISTING
        and request.deployment_request.existing_account_id
        and request.organization_context.approved_account_ids
        and request.deployment_request.existing_account_id not in request.organization_context.approved_account_ids
    ):
        violations.append("The requested existing account is not in the approved account list.")

    if request.organization_context.private_network_required and not request.infra_plan.networking.private_network:
        violations.append("Private networking is required for this organization.")

    if not request.deployment_request.public_ingress_required and any(service.public for service in request.infra_plan.services):
        violations.append("Public resources were requested in the plan without public_ingress_required.")

    if any(not service.managed for service in request.infra_plan.services):
        violations.append("The plan contains a service that is not marked as managed.")

    if not request.infra_plan.iam.least_privilege:
        violations.append("IAM plan must enforce least privilege.")

    if not request.cost_estimate.within_budget:
        violations.append(
            f"Estimated monthly cost {request.cost_estimate.estimated_monthly_cost:.2f} exceeds the budget limit of {request.cost_estimate.budget_limit:.2f}."
        )

    return ValidatePolicyToolOutput(
        passed=len(violations) == 0,
        violations=violations,
    )


def _generate_terraform(request: GenerateTerraformToolInput) -> GenerateTerraformToolOutput:
    provider_names = _collect_terraform_providers(request.provider, request.infra_plan.services)
    provider_requirements = "\n".join(
        (
            f"    {provider.value} = {{\n"
            f"      source  = \"{PROVIDER_TERRAFORM_SOURCES.get(provider, 'hashicorp/null')}\"\n"
            f"      version = \">= 1.0.0\"\n"
            f"    }}"
        )
        for provider in provider_names
    )
    provider_blocks = "\n\n".join(
        (
            f"provider \"{provider.value}\" {{\n"
            "  region = var.region\n"
            "}"
        )
        for provider in provider_names
    )
    modules = [_slugify(service.service_name) for service in request.infra_plan.services]
    tag_lines = "\n".join(
        f'    {json.dumps(key)} = {json.dumps(value)}'
        for key, value in sorted(request.infra_plan.tags.items())
    )
    planned_service_lines = ",\n".join(
        f'    {json.dumps(service.service_name)}'
        for service in request.infra_plan.services
    )
    service_blocks = "\n\n".join(
        _render_service_block(index, service)
        for index, service in enumerate(request.infra_plan.services, start=1)
    )

    main_tf = f"""terraform {{
  required_version = ">= 1.5.0"

  required_providers {{
{provider_requirements}
  }}
}}

{provider_blocks}

locals {{
  project_tags = {{
{tag_lines}
  }}

  planned_services = [
{planned_service_lines}
  ]
}}

{service_blocks}
"""

    variables_tf = """variable "region" {
  type = string
}

variable "project" {
  type = string
}

variable "env" {
  type = string
}

variable "owner" {
  type = string
}
"""

    outputs_tf = """output "planned_services" {
  value = local.planned_services
}
"""

    return GenerateTerraformToolOutput(
        modules=modules,
        files=[
            AllocatorTerraformFile(path="main.tf", content=main_tf),
            AllocatorTerraformFile(path="variables.tf", content=variables_tf),
            AllocatorTerraformFile(path="outputs.tf", content=outputs_tf),
        ],
    )


def _apply_terraform(
    request: ApplyTerraformToolInput,
    organization_context: AllocatorOrganizationContext,
) -> ApplyTerraformToolOutput:
    if not request.approval_to_apply:
        return ApplyTerraformToolOutput(
            applied=False,
            execution_mode="bundle_only",
            artifact_path=None,
            detail="Approval to apply was not granted.",
        )

    if not organization_context.terraform_runner_enabled:
        return ApplyTerraformToolOutput(
            applied=False,
            execution_mode="bundle_only",
            artifact_path=None,
            detail="Terraform runner is not enabled for this organization context.",
        )

    artifact_root = Path(
        request.artifact_root
        or Path(__file__).resolve().parent.parent / "generated" / "terraform"
    )
    bundle_id = datetime.now(UTC).strftime("%Y%m%d%H%M%S") + "-" + uuid4().hex[:8]
    bundle_path = artifact_root / bundle_id
    bundle_path.mkdir(parents=True, exist_ok=True)

    for terraform_file in request.terraform.files:
        (bundle_path / terraform_file.path).write_text(terraform_file.content, encoding="utf-8")

    manifest = {
        "provider": request.provider.value,
        "submitted_at": datetime.now(UTC).isoformat(),
        "files": [terraform_file.path for terraform_file in request.terraform.files],
    }
    (bundle_path / "apply.manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    return ApplyTerraformToolOutput(
        applied=True,
        execution_mode="runner_handoff",
        artifact_path=str(bundle_path),
        detail=f"Terraform bundle staged for provisioning handoff at {bundle_path}.",
    )


def _render_service_block(index: int, service: AllocatorPlannedService) -> str:
    service_slug = _slugify(service.service_name) or f"service_{index}"
    provider_name = service.provider.value if service.provider is not None else "unspecified"
    return f"""resource "terraform_data" "{service_slug}" {{
  input = {{
    provider                    = "{provider_name}"
    service_name                = {json.dumps(service.service_name)}
    service_code                = {json.dumps(service.service_code or service_slug)}
    purpose                     = {json.dumps(service.purpose)}
    category                    = {json.dumps(service.category)}
    estimated_monthly_cost_usd  = {service.estimated_monthly_cost_usd}
    managed                     = {str(service.managed).lower()}
    public                      = {str(service.public).lower()}
    tags                        = local.project_tags
  }}
}}
"""


def _infer_service_category(provider: CloudProvider | None, service: ServiceEstimate) -> str:
    if provider and service.service_code:
        try:
            return get_catalog_service(provider, service.service_code).category.value
        except KeyError:
            pass

    label = f"{service.name} {service.purpose}".lower()
    if any(keyword in label for keyword in ("sql", "postgres", "mysql", "database", "aurora", "db")):
        return "database"
    if any(keyword in label for keyword in ("storage", "backup", "object", "blob", "bucket")):
        return "storage"
    if any(keyword in label for keyword in ("cdn", "load balancer", "front door", "gateway")):
        return "networking"
    if any(keyword in label for keyword in ("ai", "ml", "inference")):
        return "ai_ml"
    if any(keyword in label for keyword in ("warehouse", "analytics", "stream")):
        return "analytics"
    if any(keyword in label for keyword in ("kms", "firewall", "waf", "security")):
        return "security"
    return "compute"


def _is_managed_service(service: ServiceEstimate) -> bool:
    label = f"{service.name} {service.purpose}".lower()
    unmanaged_signals = ("self-managed", "self managed", "virtual machine", "instance admin")
    return not any(signal in label for signal in unmanaged_signals)


def _is_public_service_candidate(service: ServiceEstimate) -> bool:
    label = f"{service.name} {service.purpose}".lower()
    return any(keyword in label for keyword in ("cdn", "load balancer", "gateway", "front door"))


def _is_compute_service(service: ServiceEstimate) -> bool:
    label = f"{service.name} {service.purpose}".lower()
    return any(
        keyword in label
        for keyword in (
            "compute",
            "container",
            "kubernetes",
            "runtime",
            "app service",
            "workers",
            "engine",
            "instance",
            "vm",
        )
    )


def _collect_terraform_providers(
    fallback_provider: CloudProvider,
    services: list[AllocatorPlannedService],
) -> list[CloudProvider]:
    providers = {service.provider for service in services if service.provider is not None}
    if not providers:
        providers.add(fallback_provider)
    return sorted(providers, key=lambda item: item.value)


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
