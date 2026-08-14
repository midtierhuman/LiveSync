# LiveSync Testing & Verification Guide

This guide details how to run unit, integration, and build tests across the entire LiveSync full-stack architecture.

---

## 🅰️ Angular Frontend Tests (`livesync-ui`)

Runs Karma/Jasmine unit tests with headless Chrome and builds the production bundle:

```powershell
cd livesync-ui
# Run all unit tests once
npm test -- --watch=false

# Validate production build & AOT compilation
npm run build
```

---

## 🐍 Python Sandbox Tests (`livesync-sandbox`)

Runs `pytest` verifying polyglot executor runtimes, AST Big-O complexity analyzer, package discovery, and gRPC endpoints:

```powershell
cd livesync-sandbox
# Run all pytest suites
.\venv\Scripts\python.exe -m pytest
```

---

## 🔷 Go Gateway Tests (`livesync-gateway`)

Compiles the Go gateway binary and runs package tests:

```powershell
cd livesync-gateway
# Run package unit tests
go test ./...

# Verify Go compilation
go build -v .
```

---

## 🔷 Go Core REST API Tests (`livesync-api`)

Compiles the Go REST API binary and runs package tests:

```powershell
cd livesync-api
# Run package unit tests
go test -v ./...

# Verify Go compilation
go build -v .
```

---

## 🟨 Node.js Realtime Tests (`livesync-realtime`)

Runs native TypeScript tests and validates TypeScript compilation:

```powershell
cd livesync-realtime
# Run test suite
npm test

# Verify TypeScript build
npm run build
```

---

## 🐳 Docker Stack Verification

```powershell
# Build and start all services
docker compose up --build -d

# Verify all containers are healthy
docker compose ps

# Check logs across services
docker compose logs -f gateway sandbox api realtime ui
```
