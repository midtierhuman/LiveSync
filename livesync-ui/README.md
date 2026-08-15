# 🌐 LiveSync UI Client (`livesync-ui`)

> **Angular 22 Zoneless Reactive Code Editor, CodeMirror 6, xterm.js Terminal & Package Manager**

The `livesync-ui` service is the web frontend client for LiveSync. Built with Angular 22 using Zoneless change detection and Signals, it provides a fast, frictionless cloud workspace for real-time collaborative development.

---

## 🚀 Key Features

- **📝 CodeMirror 6 Canvas**: High-performance syntax highlighting, multiple cursor tracking, smart autocompletion, Prettier code formatting, and word wrap with 0-waste vertical layout connecting directly to editor tabs.
- **🧭 VS Code-Style Activity Bar & Sidebar Dock**: Modern 48px left icon rail toggling full-featured sidebar panels for Project Explorer, Package Manager Hub (npm/PyPI), AI Pair Assistant, and Threaded Code Comments.
- **📊 Modern Status Bar**: Live WebSocket connection state, collaborator presence, automatic save status, cursor coordinates (`Ln X, Col Y`), character encoding (`UTF-8`), and extension-inferred language mode (`TypeScript`, `Python`, `Go`, `JavaScript`, etc.).
- **📺 Integrated Workspace Terminal**: Slide-up bi-directional `xterm.js` canvas connected to the Go Gateway PTY shell over WebSockets with keyboard shortcut support (`Ctrl+\``).
- **📦 Embedded Package Manager**: Direct search, installation, and status tracking for Python (`pip`) and JavaScript (`npm`) dependencies right within the sidebar or modal.
- **🤝 Multiplayer Presence & Follow Mode**: Real-time collaborator avatars, spectator follow mode with auto-scroll, and inline threaded code comments.
- **🤖 AI Pair Assistant**: AST Big-O complexity analysis, refactoring suggestions, unit test generation, and 1-click code application.
- **📁 Multi-Project Workspace Explorer**: Project hierarchy tree, tabbed editor interface, drag-and-drop moves, and responsive sidebar resizing.

---

## 🛠️ Development & Build Commands

### Start Local Development Server
```bash
npm start
```
Runs the application on `http://localhost:4200/` with hot reloading.

### Run Unit Tests
```bash
npm test -- --watch=false
```
Executes the Angular Jasmine/Karma test suite.

### Build Production Bundle
```bash
npm run build
```
Compiles and optimizes the production bundle into `dist/LiveSync`.

---

## 🏗️ Architecture & Component Hierarchy

- **`src/app/features/editor/`**: Primary code editing workspace, CodeMirror instance lifecycle, status bar, and toolbar controls.
- **`src/app/features/workspace/`**: Multi-file tab manager, project folder tree explorer, breadcrumbs, and drag-and-drop file organization.
- **`src/app/features/dashboard/`**: User project catalog, shared documents overview, and quick-create modals.
- **`src/app/services/`**:
  - `auth.service.ts`: JWT authentication, token storage, and session validation.
  - `document.service.ts`: REST document CRUD, access permissions, and AI assistant proxying.
  - `folder.service.ts`: Project hierarchy, subfolder trees, and folder sharing.
  - `realtime.service.ts`: Multiplexed Socket.IO client for CRDT operational transforms, presence, and comments.
  - `live-terminal.service.ts`: `xterm.js` terminal manager, PTY WebSocket client, and disk file synchronization.
  - `package-manager.service.ts`: Direct package search, reactive autocomplete, and installation status.

