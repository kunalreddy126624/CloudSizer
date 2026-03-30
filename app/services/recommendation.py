from app.models import RecommendationRequest, RecommendationResponse
from app.services.pricing import build_architecture


def build_recommendations(
    request: RecommendationRequest,
) -> RecommendationResponse:
    recommendations = [
        build_architecture(request, provider)
        for provider in request.preferred_providers
    ]
    recommendations.sort(
        key=lambda recommendation: (
            -recommendation.score,
            recommendation.estimated_monthly_cost_usd,
        )
    )
    return RecommendationResponse(
        workload_type=request.workload_type,
        baseline_inputs=request,
        recommendations=recommendations,
    )
