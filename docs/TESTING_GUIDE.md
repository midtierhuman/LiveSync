# LiveSync Testing & Verification Guide

This guide details how to run unit and integration tests across the LiveSync microservices stack.

---

## 🐍 Python Sandbox Tests (`livesync-sandbox`)

Runs `pytest` verifying executor services, AST complexity analyzer, package manager, and gRPC endpoints:

```powershell
cd D:\Projects\LiveSync\livesync-sandbox
.\venv\Scripts\python.exe -m pytest
```

---

## 🔷 Go Gateway Tests (`livesync-gateway`)

Compiles and tests Go gateway handlers, JWT middleware, and gRPC client connection:

```powershell
cd D:\Projects\LiveSync\livesync-gateway
go test ./...
go build -o livesync-gateway.exe .
```

---

## ☕ Java Spring Boot API Tests (`livesync-api`)

Runs Gradle test task:

```powershell
cd D:\Projects\LiveSync\livesync-api
.\gradlew.bat test
```

---

## 🟨 Node.js Realtime Tests (`livesync-realtime`)

Runs Jest unit tests for Socket.IO room handling and OT engine:

```powershell
cd D:\Projects\LiveSync\livesync-realtime
npm test
```
