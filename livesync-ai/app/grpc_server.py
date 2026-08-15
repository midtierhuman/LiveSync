import logging

from app.pb import sandbox_pb2, sandbox_pb2_grpc
from app.services.ai_assistant import ai_assistant_service
from app.services.catalog import catalog

logger = logging.getLogger(__name__)


class SandboxServiceServicer(sandbox_pb2_grpc.SandboxServiceServicer):

    def GetLanguages(self, request, context):
        langs = catalog.get_languages()
        descriptors = [
            sandbox_pb2.LanguageDescriptor(name=l["name"], display_name=l["display_name"])
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


def serve_grpc(port: int = 50051):
    import grpc
    from concurrent import futures
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    sandbox_pb2_grpc.add_SandboxServiceServicer_to_server(SandboxServiceServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"⚡ LiveSync AI gRPC Server listening on port {port}")
    return server
