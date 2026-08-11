import logging
from fastapi import APIRouter, HTTPException, Request, status
from app.models.ai import AiAnalysisRequest, AiAnalysisResponse
from app.services.ai_assistant import ai_assistant_service
from app.services.auth_service import auth_service

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])
logger = logging.getLogger(__name__)


@router.post(
    "/analyze",
    response_model=AiAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="AST AI Code Assistant & Code Suggestions",
)
async def analyze_code(request: Request, body: AiAnalysisRequest):
    """Provides AST-driven code explanations, refactoring tips, auto-generated unit tests, and interactive chat responses."""
    token = auth_service.get_bearer_token(request.headers.get("Authorization"))
    try:
        if not auth_service.validate_token(token):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    except ValueError as ex:
        logger.error(str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Sandbox auth is not configured.")

    res = ai_assistant_service.analyze(
        body.action,
        body.language,
        body.code,
        custom_prompt=body.prompt,
        model=body.model
    )
    return AiAnalysisResponse(
        action=res.action,
        language=res.language,
        explanation=res.explanation,
        suggestions=res.suggestions,
        generated_code=res.generated_code,
        provider=res.provider,
    )
