from __future__ import annotations

from app.noodle.schemas import NoodlePipelineIntent, NoodleReferenceSpec


REFERENCE_SPECS: list[NoodleReferenceSpec] = [
    NoodleReferenceSpec(
        id="hybrid-orders-analytics",
        name="Hybrid Orders To Lakehouse",
        summary="Unifies on-prem ERP orders with cloud clickstream and publishes a governed gold dataset.",
        tags=["hybrid", "lakehouse", "analytics"],
        sample_intent=NoodlePipelineIntent(
            name="hybrid-orders-analytics",
            business_goal="Create a trusted source of truth for order intelligence across ERP and digital channels.",
            deployment_scope="hybrid_multi_cloud",
            latency_slo="minutes",
            requires_ml_features=True,
            requires_realtime_serving=True,
            contains_sensitive_data=True,
            target_consumers=["bi", "operations_api", "demand_forecasting_model"],
            sources=[
                {
                    "name": "erp_orders",
                    "kind": "database",
                    "environment": "on_prem",
                    "format_hint": "oracle relational",
                    "change_pattern": "cdc",
                },
                {
                    "name": "web_clickstream",
                    "kind": "stream",
                    "environment": "aws",
                    "format_hint": "json events",
                    "change_pattern": "event",
                },
                {
                    "name": "warehouse_scanners",
                    "kind": "iot",
                    "environment": "edge",
                    "format_hint": "protobuf telemetry",
                    "change_pattern": "event",
                },
            ],
        ),
    ),
    NoodleReferenceSpec(
        id="multicloud-customer-360",
        name="Multi-Cloud Customer 360",
        summary="Creates a cross-cloud customer profile by merging SaaS, CRM, support, and product telemetry.",
        tags=["multi_cloud", "customer_360", "serving"],
        sample_intent=NoodlePipelineIntent(
            name="customer-360",
            business_goal="Build a single customer profile that powers BI, support routing, and churn scoring.",
            deployment_scope="multi_cloud",
            latency_slo="hours",
            requires_ml_features=True,
            requires_realtime_serving=False,
            contains_sensitive_data=True,
            target_consumers=["bi", "support_console", "retention_model"],
            sources=[
                {
                    "name": "salesforce_accounts",
                    "kind": "saas",
                    "environment": "saas",
                    "format_hint": "salesforce objects",
                    "change_pattern": "snapshot",
                },
                {
                    "name": "product_usage",
                    "kind": "stream",
                    "environment": "gcp",
                    "format_hint": "avro events",
                    "change_pattern": "event",
                },
            ],
        ),
    ),
    NoodleReferenceSpec(
        id="github-engineering-intelligence",
        name="GitHub Engineering Intelligence",
        summary="Collects GitHub repository events, pull requests, and deployment metadata into an engineering analytics pipeline.",
        tags=["github", "engineering", "analytics"],
        sample_intent=NoodlePipelineIntent(
            name="github-engineering-intelligence",
            business_goal="Create an engineering intelligence pipeline that tracks repository activity, pull request flow, and deployment lead time.",
            deployment_scope="multi_cloud",
            latency_slo="minutes",
            requires_ml_features=False,
            requires_realtime_serving=False,
            contains_sensitive_data=False,
            target_consumers=["bi", "engineering_ops", "delivery_insights_api"],
            sources=[
                {
                    "name": "github_events",
                    "kind": "github",
                    "environment": "saas",
                    "format_hint": "github webhooks and graphql objects",
                    "change_pattern": "event",
                },
                {
                    "name": "ci_deployments",
                    "kind": "api",
                    "environment": "aws",
                    "format_hint": "json deployment events",
                    "change_pattern": "append",
                },
            ],
        ),
    ),
]
