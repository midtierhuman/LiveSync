# Launch Configuration Notes

This file is kept as a historical note for the previous backend setup.
The current launch flow is documented in:

- `docs/README.md`
- `docs/backend/api/README.md`
- `docs/backend/signalr/README_BACKEND.md`
- `docs/backend/signalr/QUICK_START.md`

## Current service layout

- API: Java Spring Boot on port 8080
- Realtime: Node.js Socket.IO on port 5000
- Sandbox: Python FastAPI on port 8080
