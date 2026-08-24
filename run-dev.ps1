# LiveSync Polyglot Local Dev Launcher
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Starting LiveSync Polyglot Backend Microservices" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Start Docker Containers (Postgres, Redis, Services, Nginx)
Write-Host "[1/2] Building and launching containers via Docker Compose..." -ForegroundColor Yellow
docker compose up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] All microservices are live!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  - Nginx Gateway:    http://localhost:5038" -ForegroundColor White
    Write-Host "  - Go REST API:      http://localhost:5038/api/ (Internal: 8080)" -ForegroundColor White
    Write-Host "  - Node Realtime:    http://localhost:5038/hubs/ (Internal: 5000)" -ForegroundColor White
    Write-Host "  - Python AI Engine: http://localhost:5038/api/ai/ (Internal gRPC: 50051)" -ForegroundColor White
    Write-Host "  - Angular Frontend: http://localhost:4000" -ForegroundColor White
    Write-Host ""
    Write-Host "To view logs, run: docker compose logs -f" -ForegroundColor Gray
    Write-Host "To stop services, run: docker compose down" -ForegroundColor Gray
} else {
    Write-Host "[ERROR] Failed to start Docker containers. Make sure Docker Desktop is running." -ForegroundColor Red
}
