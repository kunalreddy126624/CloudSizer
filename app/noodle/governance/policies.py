from __future__ import annotations

from app.noodle.schemas import NoodleGovernanceControl, NoodlePipelineIntent


class GovernancePolicyService:
    def build_controls(self, intent: NoodlePipelineIntent) -> list[NoodleGovernanceControl]:
        controls = [
            NoodleGovernanceControl(
                name="rbac-abac-enforcement",
                category="access",
                enforcement_point="api-gateway-and-query-plane",
                rationale="Ensure domain and sensitivity-aware access control across all data products.",
            ),
            NoodleGovernanceControl(
                name="lineage-backed-quality-gates",
                category="quality",
                enforcement_point="silver-to-gold-publish-step",
                rationale="Prevent broken or low-quality assets from becoming the source of truth.",
            ),
        ]
        if intent.contains_sensitive_data:
            controls.extend(
                [
                    NoodleGovernanceControl(
                        name="dynamic-data-masking",
                        category="privacy",
                        enforcement_point="serving-layer-and-lakehouse-views",
                        rationale="Protect sensitive fields while preserving governed analytics access.",
                    ),
                    NoodleGovernanceControl(
                        name="residency-and-compliance-routing",
                        category="compliance",
                        enforcement_point="orchestrator-routing-engine",
                        rationale="Keep regulated records in approved regional and network boundaries.",
                    ),
                ]
            )
        return controls

    def stack(self) -> list[str]:
        return ["opa-policy-engine", "vault-or-cloud-secrets", "masking-service", "audit-lineage-store"]

