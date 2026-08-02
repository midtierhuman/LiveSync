from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import execution

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

# Register API router
app.include_router(execution.router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "UP",
        "service": "livesync-sandbox",
        "environment": settings.environment,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
