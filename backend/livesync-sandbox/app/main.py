from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from app.config import settings
from app.routers import execution, ai

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Polyglot Code Execution Sandbox microservice for LiveSync built with Python and FastAPI",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(execution.router)
app.include_router(ai.router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "UP",
        "service": "livesync-sandbox",
        "environment": settings.environment,
    }


@app.get("/metrics", tags=["Metrics"])
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
