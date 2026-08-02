# LiveSync Backend Quick Start

## Prerequisites

- Java 21
- Node.js 20+
- Redis
- PostgreSQL
- Python 3.14 if you want to run the sandbox locally

## Start the services

### 1. Auth and document API

```powershell
cd backend\livesync\livesync-api
gradlew.bat bootRun
```

### 2. Realtime service

```powershell
cd backend\livesync\livesync-realtime
npm install
npm run dev
```

### 3. Optional sandbox

```powershell
cd backend\livesync\livesync-sandbox
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload
```

## Default ports

- API: `8080`
- Realtime service: `5000`
- Sandbox: `8080`

## Useful URLs

- API health: `http://localhost:8080/health`
- Realtime health: `http://localhost:5000/health`
- Sandbox docs: `http://localhost:8080/docs`

## Flow

1. Log in with the API
2. Send the JWT to the realtime service
3. Use the document APIs for sharing and execution
