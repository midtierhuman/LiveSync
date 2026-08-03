# LiveSync Sandbox Service (Python 3.14 + FastAPI)

A modern, high-performance polyglot code execution microservice built with **Python 3.14** and **FastAPI**.

## Features

- **Python 3.14 Native**: Modern Python 3.14 features, native union types (`str | None`), generic collections (`list`, `dict`), and asynchronous process isolation.
- **FastAPI Framework**: Modern async framework with automatic OpenAPI (`/docs`) interactive documentation.
- **Polyglot Code Execution**: Supports running Python, JavaScript (Node.js 24), and C# code snippets.
- **Timeout & Process Isolation**: Enforces execution timeout boundaries (`asyncio.wait_for`) and captures `stdout`, `stderr`, and exit codes.
- **Pydantic v2**: Strict data validation with automatic camelCase JSON serialization matching `LiveSync.Execution.Contracts`.

## API Endpoints

- `GET /health`: Health check status.
- `GET /api/execution/languages`: List all supported execution engines.
- `POST /api/execution/run`: Execute a code snippet.

## Local Development

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the development server:
   ```bash
   uvicorn app.main:app --port 8080 --reload
   ```

3. Open API docs in browser:
   [http://localhost:8080/docs](http://localhost:8080/docs)
