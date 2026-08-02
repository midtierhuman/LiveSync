from fastapi import APIRouter, Request, status
import logging
from pydantic import ValidationError
from app.models.execution import (
    ExecutionLanguageDescriptor,
    SandboxExecutionRequest,
    SandboxExecutionResponse,
)
from app.services.executor_service import executor_service

router = APIRouter(prefix="/api/execution", tags=["Execution"])
logger = logging.getLogger(__name__)


@router.get(
    "/languages",
    response_model=list[ExecutionLanguageDescriptor],
    status_code=status.HTTP_200_OK,
    summary="Get supported execution languages",
)
async def get_languages():
    """Returns all supported programming languages in the sandbox."""
    return executor_service.get_languages()


@router.post(
    "/run",
    response_model=SandboxExecutionResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute code snippet in sandbox",
)
async def execute_code(request: Request):
    """Executes code snippet securely and returns standard output, error, exit code, and execution metrics."""
    raw_body = await request.body()
    print(f"Execution request raw body length={len(raw_body)}", flush=True)
    if not raw_body:
        return SandboxExecutionResponse(
            language="",
            status="Rejected",
            is_success=False,
            message="Request body is required.",
            standard_output="",
            standard_error="Request body is required.",
        )

    try:
        execution_request = SandboxExecutionRequest.model_validate_json(raw_body)
    except ValidationError as error:
        return SandboxExecutionResponse(
            language="",
            status="Rejected",
            is_success=False,
            message="Invalid execution request.",
            standard_output="",
            standard_error=str(error),
        )

    return await executor_service.execute(execution_request)
