import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { appEndpoints } from '../app-endpoints';
import { AuthService } from './auth.service';

interface PendingCommand {
  command: string;
  files?: Record<string, string>;
}

@Injectable({
  providedIn: 'root',
})
export class LiveTerminalService {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private socket: WebSocket | null = null;
  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private currentProjectId: string = 'default';
  private resizeObserver: ResizeObserver | null = null;
  private pendingCommands: PendingCommand[] = [];
  private pendingSyncFiles: { files: Record<string, string>; lockedFiles?: string[] } | null = null;

  readonly isConnected = signal<boolean>(false);
  readonly terminalStatus = signal<string>('Idle');
  readonly onFileSystemChange = signal<{
    type: string;
    action: string;
    event: string;
    path: string;
    isDir: boolean;
    timestamp: number;
  } | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroy();
    });
  }

  get terminalInstance(): Terminal | null {
    return this.term;
  }

  private getTheme(isDark: boolean) {
    return isDark
      ? {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: 'rgba(56, 139, 253, 0.35)',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#f0f6fc',
        }
      : {
          background: '#ffffff',
          foreground: '#24292f',
          cursor: '#0969da',
          cursorAccent: '#ffffff',
          selectionBackground: 'rgba(9, 105, 218, 0.2)',
          black: '#24292f',
          red: '#cf222e',
          green: '#1a7f37',
          yellow: '#9a6700',
          blue: '#0969da',
          magenta: '#8250df',
          cyan: '#1b7c83',
          white: '#6e7781',
          brightBlack: '#57606a',
          brightRed: '#a40e26',
          brightGreen: '#116329',
          brightYellow: '#633c01',
          brightBlue: '#0550ae',
          brightMagenta: '#5a32a3',
          brightCyan: '#124d54',
          brightWhite: '#8c959f',
        };
  }

  attachToElement(container: HTMLElement, projectId?: string, isDark: boolean = true) {
    if (projectId && projectId !== this.currentProjectId) {
      this.currentProjectId = projectId;
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    } else if (projectId) {
      this.currentProjectId = projectId;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.term) {
      try {
        this.term.dispose();
      } catch {
        // Safe dispose
      }
      this.term = null;
      this.fitAddon = null;
    }

    container.innerHTML = '';

    this.term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      theme: this.getTheme(isDark),
      allowProposedApi: true,
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);

    // User input in terminal canvas forwarded directly to WebSocket
    this.term.onData((data) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(data);
      }
    });

    // Resize event
    this.term.onResize((size) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN && size.cols > 0 && size.rows > 0) {
        this.socket.send(
          JSON.stringify({
            action: 'resize',
            cols: size.cols,
            rows: size.rows,
          }),
        );
      }
    });

    // ResizeObserver on the container
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.fit();
      });
      this.resizeObserver.observe(container);
    }

    setTimeout(() => {
      this.fit();
      this.focus();
    }, 50);

    this.connect();
  }

  setTheme(isDark: boolean) {
    if (!this.term) return;
    this.term.options.theme = this.getTheme(isDark);
  }

  fit() {
    try {
      if (
        this.fitAddon &&
        this.term &&
        this.term.element &&
        this.term.element.offsetParent !== null &&
        this.term.element.clientWidth > 0 &&
        this.term.element.clientHeight > 0
      ) {
        this.fitAddon.fit();
      }
    } catch {
      // Ignore fit errors if container is hidden or not attached
    }
  }

  focus() {
    setTimeout(() => {
      this.term?.focus();
    }, 20);
  }

  connect(projectId?: string) {
    if (projectId && projectId !== this.currentProjectId) {
      this.currentProjectId = projectId;
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    } else if (projectId) {
      this.currentProjectId = projectId;
    }

    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        if (this.term && (this.term.cols || 0) > 0 && (this.term.rows || 0) > 0) {
          this.fit();
          this.socket.send(
            JSON.stringify({
              action: 'resize',
              cols: this.term.cols || 80,
              rows: this.term.rows || 24,
            }),
          );
        }
        return;
      }
      if (this.socket.readyState === WebSocket.CONNECTING) {
        return;
      }
      this.socket.close();
      this.socket = null;
    }

    const httpBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
    const token = this.authService.token();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const wsUrl =
      httpBase
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/$/, '') +
      `/api/terminal/ws?projectId=${encodeURIComponent(this.currentProjectId)}${tokenParam}`;

    this.terminalStatus.set('Connecting...');

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected.set(true);
        this.terminalStatus.set('Connected');

        // Send initial resize to sync PTY geometry
        if (this.term && (this.term.cols || 0) > 0 && (this.term.rows || 0) > 0) {
          this.fit();
          this.socket?.send(
            JSON.stringify({
              action: 'resize',
              cols: this.term.cols || 80,
              rows: this.term.rows || 24,
            }),
          );
        }

        // Flush any pending file synchronization
        if (this.pendingSyncFiles) {
          const { files, lockedFiles } = this.pendingSyncFiles;
          this.pendingSyncFiles = null;
          this.syncFiles(files, lockedFiles);
        }

        // Flush queued commands with files snapshots
        if (this.pendingCommands.length > 0) {
          const cmds = [...this.pendingCommands];
          this.pendingCommands = [];
          cmds.forEach(({ command, files }) => this.runCommand(command, files));
        }
      };

      this.socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          // Detect structured JSON change notifications from fsnotify
          const trimmed = event.data.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const msg = JSON.parse(trimmed);
              if (msg.type === 'fs_change' || msg.action === 'fs_change') {
                this.onFileSystemChange.set({ ...msg, timestamp: Date.now() });
                return;
              }
            } catch {
              // Not JSON, fallthrough to terminal rendering
            }
          }
          this.term?.write(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          this.term?.write(new Uint8Array(event.data));
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buffer) => {
            this.term?.write(new Uint8Array(buffer));
          });
        }
      };

      this.socket.onerror = () => {
        this.isConnected.set(false);
        this.terminalStatus.set('Error');
      };

      this.socket.onclose = () => {
        this.isConnected.set(false);
        this.terminalStatus.set('Disconnected');
        this.socket = null;
      };
    } catch {
      this.isConnected.set(false);
      this.terminalStatus.set('Failed to connect');
    }
  }

  syncFiles(files: Record<string, string>, lockedFiles?: string[]) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingSyncFiles = {
        files: { ...this.pendingSyncFiles?.files, ...files },
        lockedFiles: lockedFiles || this.pendingSyncFiles?.lockedFiles || [],
      };
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        this.connect();
      }
      return;
    }

    this.socket.send(
      JSON.stringify({
        action: 'sync_files',
        files,
        lockedFiles: lockedFiles || [],
      }),
    );
  }

  runCommand(command: string, files?: Record<string, string>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingCommands.push({ command, files });
      this.connect();
      return;
    }

    this.socket.send(
      JSON.stringify({
        action: 'run_command',
        data: command,
        files: files || {},
      }),
    );
  }

  sendInput(data: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  clear() {
    this.term?.clear();
  }

  restart() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.term?.reset();
    this.connect();
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.term) {
      try {
        this.term.dispose();
      } catch {
        // Safe dispose
      }
      this.term = null;
      this.fitAddon = null;
    }
    this.isConnected.set(false);
    this.terminalStatus.set('Closed');
  }
}
