@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo    LiveSync Polyglot Microservices Dev Orchestrator
echo ================================================================
echo.

echo [1/3] Gracefully stopping running LiveSync containers...
docker compose down
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Docker compose down returned a non-zero exit code or no containers were running.
)

echo.
echo [2/3] Building and starting microservices stack in detached mode...
docker compose up --build -d
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to build or start Docker containers!
    echo Ensure Docker Desktop / Docker daemon is running and reachable.
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Verifying container health and readiness...
echo.
echo ================================================================
echo   [SUCCESS] LiveSync Polyglot Mesh is Live!
echo ================================================================
echo.
echo   - Angular IDE Frontend:   http://localhost:4000
echo   - Nginx API Gateway:      http://localhost:5038
echo   - Go Live Gateway & PTY:  http://localhost:8081
echo   - Go REST Core API:       http://localhost:5038/api/  (Internal: 8080)
echo   - Node.js Realtime Hub:   http://localhost:5038/hubs/ (Internal: 5000)
echo   - Python AI Worker:       http://localhost:5038/api/ai/ (gRPC: 50051)
echo   - PostgreSQL Database:    localhost:5432
echo   - Redis Streams & Cache:  localhost:6379
echo.
echo Attaching live logs stream (press Ctrl+C to detach without stopping services)...
echo ================================================================
echo.

docker compose logs -f
