# LiveSync Realtime Quick Start

## Prerequisites

- Java 21 JDK
- Node.js 24+
- Python 3.14+
- Redis 7+
- PostgreSQL 18

## Start the Services

### 1. Auth, Document & Folder API (`livesync-api`)

```powershell
cd livesync-api
.\gradlew.bat bootRun
```

### 2. Realtime Service (`livesync-realtime`)

```powershell
cd livesync-realtime
npm install
npm run dev
```

### 3. Execution Sandbox (`livesync-sandbox`)

```powershell
cd livesync-sandbox
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload
```

## Default Ports

- API (`livesync-api`): `8080` (Internal) / `5038` (Nginx)
- Realtime (`livesync-realtime`): `5000`
- Sandbox (`livesync-sandbox`): `8080`
- Frontend (`livesync-ui`): `4000` / `4200`
- Prometheus (`livesync-infra`): `9090`
- Grafana (`livesync-infra`): `3000`

## Useful URLs

- Realtime health: `http://localhost:5000/health`
- Sandbox API docs: `http://localhost:8080/docs`
- Prometheus metrics: `http://localhost:9090`
- Grafana dashboards: `http://localhost:3000`
