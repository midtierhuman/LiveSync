from fastapi import APIRouter, status
from app.models.ai import AiAnalysisRequest, AiAnalysisResponse
from app.services.ai_assistant import ai_assistant_service

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


@router.post(
    "/analyze",
    response_model=AiAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="AST AI Code Assistant & Code Suggestions",
)
async def analyze_code(request: AiAnalysisRequest):
    """Provides AST-driven code explanations, refactoring tips, auto-generated unit tests, and completion suggestions."""
    res = ai_assistant_service.analyze(request.action, request.language, request.code)
    return AiAnalysisResponse(
        action=res.action,
        language=res.language,
        explanation=res.explanation,
        suggestions=res.suggestions,
        generated_code=res.generated_code,
    )
