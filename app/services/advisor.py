import re

from app.models import (
    AvailabilityTier,
    AdvisorChatMessage,
    AdvisorPlannedItem,
    AdvisorProviderPlan,
    AdvisorSuggestion,
    BudgetPreference,
    CloudProvider,
    EstimationAdvisorChatRequest,
    EstimationAdvisorChatResponse,
    EstimationAdvisorRequest,
    EstimationAdvisorResponse,
    RecommendationRequest,
    RecommendationResponse,
    ServicePricingLineItemRequest,
    ServicePricingRequest,
    WorkloadType,
)
from app.services.catalog import get_catalog_services
from app.services.recommendation import build_recommendations
from app.services.service_pricing import calculate_service_pricing


FAMILY_REASONING: dict[str, str] = {
    "virtual_machine": "Useful when the workload needs steady compute or custom operating system control.",
    "containers_managed": "Useful for scalable application tiers that still want managed orchestration.",
    "serverless_runtime": "Useful for event-driven APIs, background jobs, and low-ops compute.",
    "object_storage": "Useful for backups, assets, exports, and unstructured files.",
    "block_storage": "Useful for VM-attached storage and IOPS-sensitive workloads.",
    "relational_database": "Useful for transactional ERP, CRM, and line-of-business applications.",
    "nosql_database": "Useful for high-scale document or key-value access patterns.",
    "load_balancer": "Useful for distributing traffic across application nodes.",
    "content_delivery": "Useful for edge delivery, caching, and lower-latency user access.",
    "data_warehouse": "Useful for reporting, dashboards, and analytical workloads.",
    "stream_analytics": "Useful for event pipelines and streaming telemetry.",
    "generative_ai": "Useful when the plan includes copilots, chat, summarization, or content generation.",
    "vision_ai": "Useful when the workload processes images, OCR, or visual inspection.",
    "key_management": "Useful for encryption key lifecycle and compliance controls.",
    "web_application_firewall": "Useful for protecting public-facing applications from common web threats.",
}


WORKLOAD_KEYWORDS: list[tuple[WorkloadType, tuple[str, ...]]] = [
    (WorkloadType.ERP, ("erp", "finance", "inventory", "procurement", "sap")),
    (WorkloadType.CRM, ("crm", "sales", "customer", "support", "leads")),
    (WorkloadType.APPLICATION, ("app", "application", "portal", "website", "api", "platform")),
]


DETAIL_KEYWORDS = (
    "user",
    "users",
    "concurrent",
    "region",
    "storage",
    "database",
    "backup",
    "dr",
    "latency",
    "api",
    "erp",
    "crm",
    "application",
    "budget",
)

REGION_HINTS: list[tuple[str, str]] = [
    ("india", "ap-south-1"),
    ("mumbai", "ap-south-1"),
    ("singapore", "ap-southeast-1"),
    ("europe", "eu-west-1"),
    ("london", "eu-west-2"),
    ("germany", "eu-central-1"),
    ("us", "us-east-1"),
    ("usa", "us-east-1"),
    ("virginia", "us-east-1"),
    ("california", "us-west-1"),
]


def detect_workload(requirement: str) -> WorkloadType | None:
    lowered = requirement.lower()
    for workload, keywords in WORKLOAD_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return workload
    return None


def detect_service_families(requirement: str) -> list[str]:
    lowered = requirement.lower()
    families: list[str] = []

    keyword_map: list[tuple[str, tuple[str, ...]]] = [
        ("relational_database", ("database", "postgres", "mysql", "sql", "transaction")),
        ("nosql_database", ("nosql", "document", "key value", "key-value")),
        ("object_storage", ("backup", "files", "documents", "storage", "attachment")),
        ("block_storage", ("disk", "iops", "volume")),
        ("virtual_machine", ("vm", "virtual machine", "windows server", "linux server")),
        ("containers_managed", ("container", "kubernetes", "docker", "microservice")),
        ("serverless_runtime", ("serverless", "function", "lambda", "event-driven")),
        ("load_balancer", ("load balancer", "ha", "high availability")),
        ("content_delivery", ("cdn", "global users", "edge", "latency")),
        ("data_warehouse", ("warehouse", "bi", "dashboard", "analytics", "reporting")),
        ("stream_analytics", ("stream", "events", "telemetry", "pipeline")),
        ("generative_ai", ("ai", "copilot", "chatbot", "llm", "summarization")),
        ("vision_ai", ("ocr", "image", "vision", "inspection")),
        ("key_management", ("kms", "encryption", "keys", "compliance")),
        ("web_application_firewall", ("waf", "firewall", "public web", "internet-facing")),
    ]

    for family, keywords in keyword_map:
        if any(keyword in lowered for keyword in keywords):
            families.append(family)

    if not families:
        families.extend(
            ["containers_managed", "relational_database", "object_storage", "load_balancer"]
        )

    return families


def build_provider_suggestions(
    families: list[str], providers: list[CloudProvider]
) -> list[AdvisorSuggestion]:
    suggestions: list[AdvisorSuggestion] = []

    for provider in providers:
        provider_services = get_catalog_services(provider=provider)
        for family in families:
            service = next(
                (item for item in provider_services if item.service_family == family),
                None,
            )
            if not service:
                continue
            suggestions.append(
                AdvisorSuggestion(
                    provider=provider,
                    service_code=service.service_code,
                    service_name=service.name,
                    rationale=FAMILY_REASONING[family],
                )
            )

    return suggestions


def build_provider_plans(
    families: list[str], providers: list[CloudProvider]
) -> list[AdvisorProviderPlan]:
    plans: list[AdvisorProviderPlan] = []

    for provider in providers:
        provider_services = get_catalog_services(provider=provider)
        planned_items: list[AdvisorPlannedItem] = []
        pricing_items: list[ServicePricingLineItemRequest] = []

        for family in families:
            service = next(
                (item for item in provider_services if item.service_family == family),
                None,
            )
            if not service:
                continue

            usage = {
                dimension.key: float(dimension.suggested_value)
                for dimension in service.dimensions
            }
            planned_items.append(
                AdvisorPlannedItem(
                    service_code=service.service_code,
                    service_name=service.name,
                    region=service.default_region,
                    usage=usage,
                    rationale=FAMILY_REASONING[family],
                )
            )
            pricing_items.append(
                ServicePricingLineItemRequest(
                    service_code=service.service_code,
                    region=service.default_region,
                    usage=usage,
                )
            )

        if not pricing_items:
            continue

        pricing_response = calculate_service_pricing(
            ServicePricingRequest(provider=provider, items=pricing_items)
        )
        plans.append(
            AdvisorProviderPlan(
                provider=provider,
                estimated_monthly_cost_usd=pricing_response.estimated_monthly_cost_usd,
                items=planned_items,
            )
        )

    plans.sort(key=lambda item: item.estimated_monthly_cost_usd)
    return plans


def advise_estimation_plan(
    request: EstimationAdvisorRequest,
) -> EstimationAdvisorResponse:
    workload = detect_workload(request.requirement)
    families = detect_service_families(request.requirement)
    suggestions = build_provider_suggestions(families, request.preferred_providers)
    provider_plans = build_provider_plans(families, request.preferred_providers)

    assumptions = [
        "The initial estimate assumes managed services are preferred where available.",
        "Traffic, storage growth, and backup policy should be validated before final pricing.",
    ]
    if request.monthly_budget_usd is not None:
        assumptions.append(
            f"A working monthly budget cap of ${request.monthly_budget_usd:.2f} was provided."
        )

    estimation_steps = [
        "Confirm the primary workload type and user concurrency profile.",
        "Estimate the application tier using compute, container, or serverless services.",
        "Estimate the data tier using relational or NoSQL services as appropriate.",
        "Add storage, networking, and security controls required for production readiness.",
        "Compare provider-specific totals and refine the plan with reserved or committed pricing later.",
    ]

    next_questions = [
        "What availability target is required: standard, high, or mission critical?",
        "How much storage growth do you expect over 12 months?",
        "Does the workload need disaster recovery in another region?",
        "Is there any compliance requirement such as data residency or key management controls?",
    ]

    workload_summary = (
        f"Detected a {workload.value.upper()}-style workload."
        if workload
        else "Detected a general application workload with mixed infrastructure needs."
    )

    return EstimationAdvisorResponse(
        detected_workload=workload,
        summary=(
            f"{workload_summary} The initial estimation plan should focus on "
            f"{', '.join(families[:4]).replace('_', ' ')} first."
        ),
        assumptions=assumptions,
        estimation_steps=estimation_steps,
        recommended_service_families=families,
        provider_suggestions=suggestions,
        provider_plans=provider_plans,
        recommended_provider=provider_plans[0].provider if provider_plans else None,
        next_questions=next_questions,
    )


def _collect_user_requirement(messages: list[AdvisorChatMessage]) -> str:
    return "\n".join(
        message.content.strip()
        for message in messages
        if message.role == "user" and message.content.strip()
    )


def _has_sufficient_detail(requirement: str) -> bool:
    lowered = requirement.lower()
    has_numeric_signal = any(character.isdigit() for character in requirement)
    has_keyword_signal = any(keyword in lowered for keyword in DETAIL_KEYWORDS)
    return len(requirement.strip()) >= 40 and (has_numeric_signal or has_keyword_signal)


def _build_clarifying_message(
    requirement: str,
    workload: WorkloadType | None,
    families: list[str],
) -> str:
    workload_hint = (
        f"I read this as a possible {workload.value.upper()} workload. "
        if workload
        else "I do not have enough detail yet to classify the workload cleanly. "
    )
    family_hint = (
        f"The first service families likely involved are {', '.join(families[:3]).replace('_', ' ')}. "
        if families
        else ""
    )
    return (
        f"{workload_hint}{family_hint}"
        "Before I lock an estimate, tell me the user volume, target region, data size, "
        "and whether you need high availability or disaster recovery."
    )


def _build_estimate_message(estimate: EstimationAdvisorResponse) -> str:
    top_plan = estimate.provider_plans[0] if estimate.provider_plans else None
    provider_line = (
        f"The lowest current draft is {top_plan.provider.value.upper()} at "
        f"${top_plan.estimated_monthly_cost_usd:.2f} per month. "
        if top_plan
        else "I could not price a provider draft from the current inputs. "
    )
    families = ", ".join(
        family.replace("_", " ") for family in estimate.recommended_service_families[:4]
    )
    questions = " ".join(estimate.next_questions[:2])
    return (
        f"{estimate.summary} {provider_line}"
        f"I sized the first pass around {families}. "
        f"Next, confirm these points: {questions}"
    )


def infer_recommendation_request(
    requirement: str,
    providers: list[CloudProvider],
) -> RecommendationRequest:
    lowered = requirement.lower()
    workload = detect_workload(requirement) or WorkloadType.APPLICATION

    user_count = _extract_number_before_keywords(
        requirement,
        ("users", "user", "seats", "employees", "staff"),
    ) or 120

    concurrent_users = _extract_number_before_keywords(
        requirement,
        ("concurrent users", "concurrent", "active users"),
    )
    if concurrent_users is None:
        concurrent_users = max(int(user_count * 0.35), 20)

    storage_gb = _extract_storage_gb(requirement) or 500
    monthly_requests_million = _extract_monthly_requests_million(requirement) or 1.2

    availability_tier = AvailabilityTier.HIGH
    if "mission critical" in lowered or "zero downtime" in lowered:
        availability_tier = AvailabilityTier.MISSION_CRITICAL
    elif "standard" in lowered:
        availability_tier = AvailabilityTier.STANDARD

    budget_preference = BudgetPreference.BALANCED
    if any(keyword in lowered for keyword in ("lowest cost", "cheapest", "budget", "cost sensitive")):
        budget_preference = BudgetPreference.LOWEST_COST
    elif any(keyword in lowered for keyword in ("enterprise", "premium", "compliance first")):
        budget_preference = BudgetPreference.ENTERPRISE

    requires_dr = any(
        keyword in lowered
        for keyword in ("disaster recovery", "dr", "secondary region", "failover")
    )
    requires_managed_database = not any(
        keyword in lowered
        for keyword in ("self managed database", "self-hosted database", "manage database ourselves")
    )

    region = _extract_region(requirement) or "ap-south-1"

    return RecommendationRequest(
        workload_type=workload,
        region=region,
        user_count=max(user_count, 1),
        concurrent_users=max(concurrent_users, 1),
        storage_gb=max(storage_gb, 1),
        monthly_requests_million=max(monthly_requests_million, 0.0),
        requires_disaster_recovery=requires_dr,
        requires_managed_database=requires_managed_database,
        availability_tier=availability_tier,
        budget_preference=budget_preference,
        preferred_providers=providers,
    )


def _extract_number_before_keywords(text: str, keywords: tuple[str, ...]) -> int | None:
    for keyword in keywords:
        pattern = rf"(\d[\d,]*)\s+{re.escape(keyword)}"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return int(match.group(1).replace(",", ""))
    return None


def _extract_storage_gb(text: str) -> int | None:
    tb_match = re.search(r"(\d+(?:\.\d+)?)\s*tb", text, flags=re.IGNORECASE)
    if tb_match:
        return int(float(tb_match.group(1)) * 1024)

    gb_match = re.search(r"(\d+(?:\.\d+)?)\s*gb", text, flags=re.IGNORECASE)
    if gb_match:
        return int(float(gb_match.group(1)))

    return None


def _extract_monthly_requests_million(text: str) -> float | None:
    million_match = re.search(
        r"(\d+(?:\.\d+)?)\s*(million|m)\s+(?:requests|transactions|api calls)",
        text,
        flags=re.IGNORECASE,
    )
    if million_match:
        return float(million_match.group(1))

    raw_match = re.search(
        r"(\d[\d,]*)\s+(?:requests|transactions|api calls)\s+(?:per month|monthly)",
        text,
        flags=re.IGNORECASE,
    )
    if raw_match:
        return round(int(raw_match.group(1).replace(",", "")) / 1_000_000, 2)

    return None


def _extract_region(text: str) -> str | None:
    region_match = re.search(
        r"\b([a-z]{2}-[a-z]+-\d|centralindia|eastus|westus|northeurope|westeurope)\b",
        text.lower(),
    )
    if region_match:
        return region_match.group(1)

    lowered = text.lower()
    for keyword, region in REGION_HINTS:
        if keyword in lowered:
            return region

    return None


def advise_estimation_chat(
    request: EstimationAdvisorChatRequest,
) -> EstimationAdvisorChatResponse:
    requirement = _collect_user_requirement(request.messages)
    workload = detect_workload(requirement)
    families = detect_service_families(requirement) if requirement.strip() else []
    conversation_summary = requirement.strip() or "No user requirement captured yet."

    if not requirement.strip() or not _has_sufficient_detail(requirement):
        return EstimationAdvisorChatResponse(
            assistant_message=_build_clarifying_message(
                requirement=requirement,
                workload=workload,
                families=families,
            ),
            conversation_summary=conversation_summary,
            needs_more_detail=True,
            inferred_request=None,
            estimate=None,
            recommendation=None,
        )

    inferred_request = infer_recommendation_request(
        requirement=requirement,
        providers=request.preferred_providers,
    )
    estimate = advise_estimation_plan(
        EstimationAdvisorRequest(
            requirement=requirement,
            preferred_providers=request.preferred_providers,
            monthly_budget_usd=request.monthly_budget_usd,
        )
    )
    recommendation = build_recommendations(inferred_request)

    return EstimationAdvisorChatResponse(
        assistant_message=(
            f"{_build_estimate_message(estimate)} "
            f"I also produced a first recommendation set using {inferred_request.region}, "
            f"{inferred_request.user_count} users, and {inferred_request.storage_gb} GB of storage."
        ),
        conversation_summary=conversation_summary,
        needs_more_detail=False,
        inferred_request=inferred_request,
        estimate=estimate,
        recommendation=recommendation,
    )
