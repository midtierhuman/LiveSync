# ⚡ LiveSync

> **Enterprise Real-Time Collaborative Code Editor, Polyglot Execution Engine & Interactive REPL Terminal**

LiveSync is a high-performance, real-time collaborative code editor built using a modern microservice architecture. It combines Google Docs-style real-time collaboration with an interactive multi-language code execution sandbox, automated AST Big-O complexity analysis, dynamic terminal streaming over WebSockets, role-based access control (RBAC), and document time-travel history.

---

## 🚀 Key Features

* **🤝 Real-Time Collaboration**: Micro-second code synchronization with operational position tracking powered by Socket.IO & Redis backplane.
* **💻 Polyglot Sandbox Execution Engine**: Safe, isolated code execution supporting:
  * 🐍 **Python 3**
  * 🟨 **JavaScript / Node.js**
  * 🔷 **C# / .NET**
* **📺 Interactive REPL Terminal Stream**: Real-time bi-directional `stdin`/`stdout` streaming over WebSockets for terminal games, CLI scripts, and interactive applications.
* **📊 AST Big-O Complexity Analyzer**: Automated static analysis of code AST to compute Time Complexity ($\mathcal{O}(N)$, $\mathcal{O}(N \log N)$, $\mathcal{O}(N^2)$, etc.) and Space Complexity with detailed explanations.
* **🔐 Enterprise RBAC & Security**: Fine-grained permissions (Owner, Editor, Viewer) with real-time permission enforcement banner and isolated execution directories.
* **🕰️ Time Travel & Version History**: Snapshot timeline restoration allowing developers to view and restore previous document revisions.
* **🎨 Modern UI/UX**: Built with Angular 19, CodeMirror 6, and Google Material Design with light/dark theme toggle, word wrap, and automatic formatting (Prettier).

---

## 🏗️ System Architecture

LiveSync uses a decoupled, polyglot microservice stack designed for high throughput and security isolation:

```
                      ┌────────────────────────────────────────┐
                      │            Angular 19 UI               │
                      │  (CodeMirror 6 + Terminal + Material)  │
                      └──────────────────┬─────────────────────┘
                                         │
                                   Nginx Proxy
                                         │
       ┌─────────────────────────────────┼────────────────────────────────┐
       │                                 │                                │
       ▼                                 ▼                                ▼
┌──────────────┐                ┌──────────────────┐             ┌──────────────────┐
│ livesync-api │                │ livesync-realtime│             │ livesync-sandbox │
│ (Spring Boot │                │ (Node.js/Socket) │             │ (FastAPI/Python) │
│  Java 21)    │                └────────┬─────────┘             └────────┬─────────┘
└──────┬───────┘                         │                                │
       │                                 ▼                                ▼
       ▼                             Redis Bus                    Process Isolation &
   PostgreSQL                                                    AST Complexity Analyzer
```

### Microservice Breakdown

| Service | Stack | Description | Default Port |
| :--- | :--- | :--- | :--- |
| **Frontend** | Angular 19, TypeScript, CodeMirror 6 | Modern code editor interface with live cursor tracking & terminal | `4200` / `80` |
| **API Backend** | Java 21, Spring Boot, Flyway | Auth, user sessions, document metadata, RBAC, version history | `5038` |
| **Realtime Service**| Node.js, TypeScript, Socket.IO, Redis | Low-latency room broadcasting & real-time operation sync | `3000` |
| **Sandbox Engine** | Python 3, FastAPI, AsyncIO | Polyglot code execution, interactive WebSocket REPL, AST analysis | `4000` |
| **Database** | PostgreSQL 16 | Relational store for users, documents, permissions, and audit logs | `5432` |
| **Pub/Sub Cache** | Redis 7 | Distributed message bus for real-time Socket.IO room coordination | `6379` |

---

## 🛠️ Quick Start & Local Setup

### Prerequisites

* **Docker & Docker Compose** (Recommended)
* **PowerShell** (for Windows local setup script)
* **Node.js 20+** & **Python 3.10+** & **JDK 21** (for standalone local dev)

### Option A: Running with Docker Compose (Recommended)

To start the full polyglot stack (Postgres, Redis, Java API, Node Realtime, Python Sandbox, Frontend, and Nginx):

```bash
docker-compose up --build
```

Access the UI in your browser at `http://localhost`.

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
├── backend/
│   ├── livesync-api/        # Java 21 Spring Boot API (Auth, Documents, History)
│   ├── livesync-realtime/   # Node.js + Socket.IO Realtime Collaboration Gateway
│   ├── livesync-sandbox/    # Python FastAPI Polyglot Sandbox & AST Analyzer
│   ├── livesync-common/     # Shared DTOs and contracts
│   └── livesync-infra/      # Docker configuration & deployment manifests
├── frontend/                # Angular 19 CodeMirror Workspace App
├── docs/                    # Architecture guides, API specs & migration docs
├── docker-compose.yml       # Complete multi-container deployment configuration
├── nginx.conf               # Reverse proxy routing rules
└── run-dev.ps1              # Development launcher script
```

---

## 📄 Documentation Index

Additional design docs and references are available in the [`docs/`](./docs/README.md) folder:

* [Conflict Resolution Design](./docs/CONFLICT_RESOLUTION_DESIGN.md)
* [FAANG Readiness Checklist](./docs/FAANG_READINESS_CHECKLIST.md)
* [Project Roadmap](./docs/PROJECT_ROADMAP.md)
* [AWS Deployment Guide](./docs/deployment/AWS_DEPLOYMENT_GUIDE.md)

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
