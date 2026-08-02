from fastapi import APIRouter, status
from app.models.execution import (
    ExecutionLanguageDescriptor,
    SandboxExecutionRequest,
    SandboxExecutionResponse,
)
from app.services.executor_service import executor_service

router = APIRouter(prefix="/api/execution", tags=["Execution"])


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
async def execute_code(request: SandboxExecutionRequest):
    """Executes code snippet securely and returns standard output, error, exit code, and execution metrics."""
    return await executor_service.execute(request)
