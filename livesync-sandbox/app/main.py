import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from app.config import settings
from app.services.csharp_warmup import csharp_warmup_service

from app.grpc_server import serve_grpc

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Pre-warming polyglot code execution runtimes...")
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, csharp_warmup_service.initialize)
    grpc_server = serve_grpc(port=50051)
    yield
    grpc_server.stop(grace=3)


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Polyglot Code Execution Sandbox microservice for LiveSync built with Python and FastAPI",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health and Metrics endpoints for container orchestration
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "UP",
        "service": "livesync-sandbox",
        "mode": "gRPC Worker",
        "environment": settings.environment,
    }


@app.get("/metrics", tags=["Metrics"])
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
