# LiveSync UI (`livesync-ui`)

## Overview

`livesync-ui` is the frontend client application built with **Angular 22**, TypeScript, CodeMirror 6, and Angular Material.

## Features

- **Code Editor**: CodeMirror 6 syntax highlighting, auto-completion, fold keymaps, and word wrapping.
- **Real-Time Collaboration**: Multi-user live cursor position rendering, selection highlights, and presence badges powered by Socket.IO.
- **Interactive REPL Terminal**: Integrated terminal output renderer for streaming execution output, interactive stdin input bar, HTML preview mode (`null` origin sandboxed `<iframe>`), and JSON pretty-printer.
- **Folder Navigation & Modals**: Create folders, nested folder tree navigation, move documents between folders, and share codes.
- **Performance Optimized**: Angular `computed()` signals memoizing AST outputs and JSON formatting to ensure 60 FPS smooth change detection.

## Development

```bash
cd livesync-ui
npm install
npm run start
```

App runs on `http://localhost:4200` (or `http://localhost:4000` via Nginx Docker container).
