from datetime import datetime, timezone
from app.config import settings
from app.models.execution import (
    ExecutionLanguageDescriptor,
    SandboxExecutionRequest,
    SandboxExecutionResponse,
)
from app.services.catalog import catalog


class SandboxExecutionService:
    def get_languages(self) -> list[ExecutionLanguageDescriptor]:
        return catalog.get_languages()

    async def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        now = datetime.now(timezone.utc)
        if not request.language or not request.language.strip():
            return SandboxExecutionResponse(
                language=request.language or "",
                status="Rejected",
                is_success=False,
                message="Language is required.",
                requested_at=now,
                completed_at=now,
            )

        executor = catalog.get_executor(request.language)
        if not executor:
            return SandboxExecutionResponse(
                language=request.language,
                status="Rejected",
                is_success=False,
                message=f"Language '{request.language}' is not supported.",
                requested_at=now,
                completed_at=now,
            )

        timeout = request.timeout_ms if request.timeout_ms > 0 else settings.default_timeout_ms
        timeout = min(timeout, settings.max_timeout_ms)
        normalized_request = SandboxExecutionRequest(
            language=executor.language_name,
            code=request.code,
            standard_input=request.standard_input,
            timeout_ms=timeout,
        )

        return await executor.execute(normalized_request)


executor_service = SandboxExecutionService()
