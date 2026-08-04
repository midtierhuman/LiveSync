# ⚡ LiveSync

> **Enterprise Real-Time Collaborative Code Editor, Polyglot Execution Engine & Interactive REPL Terminal**

LiveSync is a high-performance, real-time collaborative code editor built using a modern microservice architecture. It combines Google Docs-style real-time collaboration with an interactive multi-language code execution sandbox, automated AST Big-O complexity analysis, dynamic terminal streaming over WebSockets, role-based access control (RBAC), and document time-travel history.

---

## 🚀 Key Features

* **🤝 Real-Time Collaboration**: Micro-second code synchronization with operational position tracking powered by Socket.IO & Redis backplane.
* **⚡ Event-Driven Persistence**: Realtime publishes document saves to Redis Streams (`livesync:stream:document-saves`); the Java API consumes them and persists to PostgreSQL with consumer groups (`api-save-group`).
* **💻 Polyglot Sandbox Execution Engine**: Safe, isolated code execution supporting:
  * 🐍 **Python 3.14**
  * 🟨 **JavaScript / Node.js 24**
  * ☕ **Java 21**
  * 🔷 **C# / .NET 8**
  * ⚙️ **C++ / GCC**
* **🔒 Enterprise Security & Hardware Masking**: Process tree killing (`psutil`), V8 heap memory caps (256MB), hardware specification obfuscation (`node_preload.js`), container CPU/RAM quotas, and `null`-origin sandboxed HTML previews.
* **📺 Interactive REPL Terminal Stream**: Real-time bi-directional `stdin`/`stdout` streaming over WebSockets for terminal games, CLI scripts, and interactive applications.
* **📊 AST Big-O Complexity Analyzer**: Automated static analysis of code AST to compute Time Complexity ($\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, etc.) and Space Complexity with detailed explanations.
* **🔐 Enterprise RBAC & Security**: Fine-grained permissions (Owner, Editor, Viewer) with folder hierarchy access inheritance.
* **🕰️ Time Travel & Version History**: Snapshot timeline restoration allowing developers to view and restore previous document revisions.
* **🎨 Modern UI/UX**: Built with Angular 22, CodeMirror 6, and Google Material Design with light/dark theme toggle, word wrap, and automatic formatting (Prettier).

---

## 🏗️ System Architecture

LiveSync uses a decoupled, polyglot microservice stack designed for high throughput and security isolation:

```
                      ┌────────────────────────────────────────┐
                      │            Angular 22 UI               │
                      │  (CodeMirror 6 + Terminal + Material)  │
                      └──────────────────┬─────────────────────┘
                                         │
                                   Nginx Proxy
                                         │
       ┌─────────────────────────────────┼────────────────────────────────┐
       │                                 │                                │
       ▼                                 ▼                                ▼
┌──────────────┐                ┌──────────────────┐             ┌──────────────────┐
│ livesync-api │◄─(XREADGROUP)──│ livesync-realtime│             │ livesync-sandbox │
│ (Spring Boot │                │ (Node.js/Socket) │             │ (FastAPI/Python) │
│  Java 21)    │                └────────┬─────────┘             └────────┬─────────┘
└──────┬───────┘                         │ (XADD Event)                   │
       │                                 ▼                                ▼
       ▼                         Redis Streams Log               Process Isolation &
   PostgreSQL                      (single writer)              AST Complexity Analyzer
```

### Microservice Breakdown

| Service | Stack | Description | Default Port |
| :--- | :--- | :--- | :--- |
| **Frontend (`livesync-ui`)** | Angular 22, TypeScript, CodeMirror 6 | Modern code editor interface with live cursor tracking & terminal | `4200` / `4000` |
| **API Backend (`livesync-api`)** | Java 21, Spring Boot 3, Spring Data Redis | Auth, user sessions, document & folder metadata, Redis Streams Consumer | `5038` |
| **Realtime Service (`livesync-realtime`)**| Node.js 24, TypeScript, Socket.IO 4.8, Redis | Low-latency room broadcasting, OT engine, Redis state & stream publisher | `5000` |
| **Sandbox Engine (`livesync-sandbox`)** | Python 3.14, FastAPI, AsyncIO | Polyglot code execution, interactive WebSocket REPL, AST analysis | `8080` |
| **Database (`livesync-postgres`)** | PostgreSQL 18 | Relational store for users, documents, folders, and permissions | `5432` |
| **Streams & Cache (`livesync-redis`)** | Redis 7-alpine (AOF enabled) | Write-behind streams log & distributed message bus for Socket.IO | `6379` |
| **Observability (`livesync-infra`)** | Prometheus & Grafana | Real-time system metrics, execution counters, and health monitoring | `9090` / `3000` |

---

## 🛠️ Quick Start & Local Setup

### Prerequisites

* **Docker & Docker Compose** (Recommended)
* **PowerShell** (for Windows local setup script)
* **Node.js 24+** & **Python 3.14+** & **JDK 21** (for standalone local dev)

### Option A: Running with Docker Compose (Recommended)

To start the full polyglot stack (Postgres, Redis, Java API, Node Realtime, Python Sandbox, Frontend, Nginx, Prometheus, and Grafana):

```bash
docker compose up --build
```

Access the UI in your browser at `http://localhost:4000` (or `http://localhost:5038` via load balancer).

### Option B: Local PowerShell Starter Script

Run the automated dev launcher script:

```powershell
.\run-dev.ps1
```

---

## 🎮 Interactive REPL Terminal & Execution Engine

LiveSync handles both static batch runs and interactive CLI programs seamlessly:

1. **Batch Mode (`POST /api/execution/run`)**:
   - Executes code in isolated temporary directories.
   - Captures output, execution duration, CPU time, and peak memory.
   - Automatically computes Time & Space complexity via AST analysis.
   - Timeout boundary: **15 seconds**.

2. **Interactive Stream Mode (`WS /ws/execution/stream`)**:
   - Establishes a persistent bi-directional WebSocket connection.
   - Enables character-by-character real-time streaming to the UI console.
   - Accepts interactive `stdin` input (e.g., Python `input()`, C# `Console.ReadLine()`).
   - Timeout boundary: **120 seconds**.

Both execution modes are called **directly by the UI against the sandbox service**, not through the Java API.

---

## 🧠 AST Complexity Analyzer

LiveSync features a custom AST (Abstract Syntax Tree) analyzer for Python, JavaScript, and C# located in `livesync-sandbox`:

* **Loop Nesting Depth**: Detects single, nested, and polynomial loop hierarchies ($\mathcal{O}(N)$, $\mathcal{O}(N^2)$, $\mathcal{O}(N^k)$).
* **Recursion Detection**: Contextually verifies if a function invokes itself inside its body.
* **Divide & Conquer**: Detects logarithmic binary division patterns ($\mathcal{O}(\log N)$).
* **Sorting Operations**: Detects built-in sort invocations ($\mathcal{O}(N \log N)$).
* **Memory Allocation Tracking**: Detects list comprehensions, dynamic arrays, and 2D matrix allocations.

---

## 📁 Repository Structure

```
LiveSync/
├── livesync-api/        # Java 21 Spring Boot API (Auth, Documents, Folders, History)
├── livesync-realtime/   # Node.js 24 + Socket.IO Realtime Collaboration Gateway
├── livesync-sandbox/    # Python 3.14 FastAPI Polyglot Sandbox & AST Analyzer
├── livesync-ui/         # Angular 22 CodeMirror Workspace App
├── livesync-common/     # Shared DTOs and contracts
├── livesync-infra/      # Nginx proxy configuration, Prometheus & Grafana monitoring
├── docker-compose.yml   # Complete multi-container deployment configuration
└── run-dev.ps1          # Development launcher script
```

---

## 📄 Documentation Index

Additional design docs and references are available in the [`docs/`](./docs/README.md) folder:

* [Conflict Resolution Design](./docs/CONFLICT_RESOLUTION_DESIGN.md)
* [Project Roadmap](./docs/PROJECT_ROADMAP.md)
* [AWS Deployment Guide](./docs/deployment/AWS_DEPLOYMENT_GUIDE.md)

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
