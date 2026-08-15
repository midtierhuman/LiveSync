import asyncio
import logging

from app.models.execution import SandboxExecutionRequest
from app.pb import sandbox_pb2, sandbox_pb2_grpc
from app.services.ai_assistant import ai_assistant_service
from app.services.executor_service import executor_service
from app.services.package_manager import package_manager_service

logger = logging.getLogger(__name__)


class SandboxServiceServicer(sandbox_pb2_grpc.SandboxServiceServicer):

    def ExecuteCode(self, request, context):
        lang = request.language or "python"
        code = request.code
        stdin = request.standard_input or None
        timeout_ms = request.timeout_ms if request.timeout_ms > 0 else 15000
        files_map = dict(request.files) if request.files else {}

        exec_req = SandboxExecutionRequest(
            language=lang,
            code=code,
            standard_input=stdin,
            timeout_ms=timeout_ms,
            files=files_map,
            entrypoint=request.entrypoint or None,
        )

        res = asyncio.run(executor_service.execute(exec_req))

        exit_code = res.exit_code if res.exit_code is not None else (0 if res.is_success else 1)
        duration_ms = int(res.execution_duration_ms or 0)

        return sandbox_pb2.ExecutionResponse(
            language=res.language or lang,
            status=res.status or ("Completed" if res.is_success else "Error"),
            is_success=res.is_success,
            message=res.message or "",
            exit_code=exit_code,
            stdout=res.standard_output or "",
            stderr=res.standard_error or "",
            execution_time_ms=duration_ms
        )

    def GetLanguages(self, request, context):
        langs = executor_service.get_languages()
        descriptors = [
            sandbox_pb2.LanguageDescriptor(name=l.name, display_name=l.display_name)
            for l in langs
        ]
        return sandbox_pb2.LanguagesResponse(languages=descriptors)

    def AnalyzeCode(self, request, context):
        res = ai_assistant_service.analyze(
            action=request.action,
            language=request.language,
            code=request.code,
            custom_prompt=request.prompt if request.prompt else None,
            model=request.model if request.model else None
        )
        return sandbox_pb2.AiAnalysisResponse(
            action=res.action,
            language=res.language,
            explanation=res.explanation,
            suggestions=res.suggestions,
            generated_code=res.generated_code or "",
            provider=res.provider
        )

    def SearchPackages(self, request, context):
        query = request.query
        mgr = request.package_manager or "python"
        lang = "python" if mgr in ("pypi", "python") else ("javascript" if mgr in ("npm", "javascript") else mgr)
        items = asyncio.run(package_manager_service.search_packages(query=query, language=lang))
        pb_items = [
            sandbox_pb2.PackageItem(
                name=i.get("name", ""),
                version=i.get("version", "latest"),
                description=i.get("description", "")
            )
            for i in items
        ]
        return sandbox_pb2.PackageSearchResponse(query=query, packages=pb_items)


def serve_grpc(port: int = 50051):
    import grpc
    from concurrent import futures
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    sandbox_pb2_grpc.add_SandboxServiceServicer_to_server(SandboxServiceServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"gRPC Server listening on port {port}")
    return server
