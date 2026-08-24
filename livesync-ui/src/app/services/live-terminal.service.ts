import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { appEndpoints } from '../app-endpoints';
import { AuthService } from './auth.service';
import { WorkspaceSyncService } from './workspace-sync.service';

export interface TerminalTabMeta {
  id: string;
  name: string;
  isConnected: boolean;
}

interface TerminalSession {
  id: string;
  name: string;
  term: Terminal;
  fitAddon: FitAddon;
  socket: WebSocket | null;
  wrapperEl: HTMLElement;
  isConnected: boolean;
  subDir?: string;
}

interface PendingCommand {
  command: string;
  files?: Record<string, string>;
}

@Injectable({
  providedIn: 'root',
})
export class LiveTerminalService {
  private readonly authService = inject(AuthService);
  private readonly workspaceSyncService = inject(WorkspaceSyncService);
  private readonly destroyRef = inject(DestroyRef);

  private sessions: Map<string, TerminalSession> = new Map();
  private hostContainer: HTMLElement | null = null;
  private currentProjectId: string = 'default';
  private currentProjectName: string = '';
  private isDarkMode: boolean = true;
  private resizeObserver: ResizeObserver | null = null;
  private tabCounter: number = 0;
  private pendingCommands: PendingCommand[] = [];
  private pendingSyncFiles: { files: Record<string, string>; lockedFiles?: string[] } | null = null;

  // Signals
  readonly terminalTabs = signal<TerminalTabMeta[]>([]);
  readonly activeTabId = signal<string>('');
  readonly terminalStatus = signal<string>('Idle');
  readonly onFileSystemChange = signal<{
    type: string;
    action: string;
    event: string;
    path: string;
    isDir: boolean;
    timestamp: number;
  } | null>(null);

  readonly isConnected = computed(() => {
    const activeId = this.activeTabId();
    if (!activeId) return false;
    const session = this.sessions.get(activeId);
    return Boolean(session?.isConnected);
  });

  // Backward compatibility accessor for single-terminal references
  get terminalInstance(): Terminal | null {
    const active = this.getActiveSession();
    return active ? active.term : null;
  }

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroy();
    });
  }

  private getActiveSession(): TerminalSession | null {
    const activeId = this.activeTabId();
    if (!activeId) return null;
    return this.sessions.get(activeId) || null;
  }

  private updateTabsSignal(): void {
    const metas: TerminalTabMeta[] = Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      name: s.name,
      isConnected: s.isConnected,
    }));
    this.terminalTabs.set(metas);
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

  attachToElement(container: HTMLElement, projectId?: string, isDark: boolean = true, projectName?: string): void {
    if (projectName) {
      this.currentProjectName = projectName;
    }
    this.isDarkMode = isDark;

    const hasProjectChanged = Boolean(projectId && projectId !== this.currentProjectId);
    if (hasProjectChanged) {
      this.currentProjectId = projectId!;
      // Clear sessions on project switch
      this.destroyAllSessions();
    } else if (projectId) {
      this.currentProjectId = projectId;
    }

    this.hostContainer = container;

    // Fast path: Container already has active sessions attached
    if (this.sessions.size > 0 && container.children.length > 0) {
      this.setTheme(isDark);
      setTimeout(() => {
        this.fit();
        this.focus();
      }, 30);
      return;
    }

    container.innerHTML = '';

    // Initialize ResizeObserver on host container
    if (typeof ResizeObserver !== 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.fit();
      });
      this.resizeObserver.observe(container);
    }

    // Create initial default terminal tab if none exist
    if (this.sessions.size === 0) {
      this.createTab('Terminal 1');
    }
  }

  findTabByName(name: string): string | null {
    const target = name.trim().toLowerCase();
    for (const [id, session] of this.sessions.entries()) {
      if (session.name.trim().toLowerCase() === target) {
        return id;
      }
    }
    return null;
  }

  createTab(customName?: string, subDir?: string): string {
    this.tabCounter++;
    const tabId = `term_tab_${Date.now()}_${this.tabCounter}`;
    const name = customName || `Terminal ${this.tabCounter}`;

    // Hide all existing tab wrappers first to avoid layout conflicts
    this.sessions.forEach((s) => {
      s.wrapperEl.style.display = 'none';
    });

    const wrapper = document.createElement('div');
    wrapper.id = `terminal-wrapper-${tabId}`;
    wrapper.className = 'terminal-tab-wrapper';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.display = 'block';

    if (this.hostContainer) {
      this.hostContainer.appendChild(wrapper);
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      theme: this.getTheme(this.isDarkMode),
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(wrapper);

    const session: TerminalSession = {
      id: tabId,
      name,
      term,
      fitAddon,
      socket: null,
      wrapperEl: wrapper,
      isConnected: false,
      subDir,
    };

    // User input in terminal canvas forwarded directly to WebSocket
    term.onData((data) => {
      if (session.socket && session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(data);
      }
    });

    // Resize event
    term.onResize((size) => {
      if (session.socket && session.socket.readyState === WebSocket.OPEN && size.cols > 0 && size.rows > 0) {
        session.socket.send(
          JSON.stringify({
            action: 'resize',
            cols: size.cols,
            rows: size.rows,
          }),
        );
      }
    });

    this.sessions.set(tabId, session);
    this.updateTabsSignal();

    // Switch to new tab and connect session socket
    this.switchTab(tabId);
    this.connectSession(session);

    return tabId;
  }

  createTabInDirectory(relPath: string, customName?: string): string {
    const cleanSub = relPath.replace(/^[\/\\]+|[\/\\]+$/g, '');
    const folderName = customName || cleanSub.split(/[\/\\]/).pop() || cleanSub;
    const tabName = `term: ${folderName}`;
    return this.createTab(tabName, cleanSub);
  }

  switchTab(tabId: string): void {
    if (!this.sessions.has(tabId)) return;

    this.sessions.forEach((s, id) => {
      if (id === tabId) {
        s.wrapperEl.style.display = 'block';
      } else {
        s.wrapperEl.style.display = 'none';
      }
    });

    this.activeTabId.set(tabId);
    const active = this.sessions.get(tabId);
    this.terminalStatus.set(active?.isConnected ? 'Connected' : 'Connecting...');

    setTimeout(() => {
      this.fit(tabId);
      this.focus(tabId);
      if (active?.term) {
        try {
          active.term.refresh(0, Math.max(0, active.term.rows - 1));
        } catch {
          // Safe refresh
        }
      }
    }, 40);
  }

  closeTab(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;

    // Disconnect and dispose
    if (session.socket) {
      session.socket.close();
      session.socket = null;
    }
    try {
      session.term.dispose();
    } catch {
      // Safe dispose
    }
    if (session.wrapperEl.parentNode) {
      session.wrapperEl.parentNode.removeChild(session.wrapperEl);
    }

    this.sessions.delete(tabId);
    this.updateTabsSignal();

    // If closed the active tab, switch to next available or create new
    if (this.activeTabId() === tabId) {
      const remaining = Array.from(this.sessions.keys());
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1]);
      } else {
        this.createTab('Terminal 1');
      }
    }
  }

  renameTab(tabId: string, newName: string): void {
    const session = this.sessions.get(tabId);
    if (session && newName.trim()) {
      session.name = newName.trim();
      this.updateTabsSignal();
    }
  }

  private connectSession(session: TerminalSession): void {
    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      return;
    }

    const httpBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || window.location.origin;
    const token = this.authService.token();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const projectNameParam = this.currentProjectName ? `&projectName=${encodeURIComponent(this.currentProjectName)}` : '';
    const subDirParam = session.subDir ? `&subDir=${encodeURIComponent(session.subDir)}` : '';
    const wsUrl =
      httpBase
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/$/, '') +
      `/api/terminal/ws?projectId=${encodeURIComponent(this.currentProjectId)}${projectNameParam}${subDirParam}&sessionId=${encodeURIComponent(session.id)}${tokenParam}`;

    try {
      const socket = new WebSocket(wsUrl);
      session.socket = socket;

      socket.onopen = () => {
        session.isConnected = true;
        this.updateTabsSignal();
        if (this.activeTabId() === session.id) {
          this.terminalStatus.set('Connected');
        }

        // Send initial geometry
        setTimeout(() => {
          this.fit(session.id);
          if (session.term.cols > 0 && session.term.rows > 0) {
            socket.send(
              JSON.stringify({
                action: 'resize',
                cols: session.term.cols || 80,
                rows: session.term.rows || 24,
              }),
            );
          }
        }, 50);

        // Flush pending sync files if any
        if (this.pendingSyncFiles) {
          const { files, lockedFiles } = this.pendingSyncFiles;
          this.pendingSyncFiles = null;
          this.syncFiles(files, lockedFiles);
        }

        // Flush queued commands with shell prompt buffer
        if (this.pendingCommands.length > 0) {
          const cmds = [...this.pendingCommands];
          this.pendingCommands = [];
          setTimeout(() => {
            cmds.forEach(({ command, files }) => this.runCommand(command, files));
          }, 300);
        }
      };

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const trimmed = event.data.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const msg = JSON.parse(trimmed);
              if (msg.type === 'fs_change' || msg.action === 'fs_change') {
                this.onFileSystemChange.set({ ...msg, timestamp: Date.now() });
                return;
              }
            } catch {
              // Not JSON
            }
          }
          session.term.write(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          session.term.write(new Uint8Array(event.data));
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buf) => {
            session.term.write(new Uint8Array(buf));
          });
        }
      };

      socket.onerror = () => {
        session.isConnected = false;
        this.updateTabsSignal();
        if (this.activeTabId() === session.id) {
          this.terminalStatus.set('Error');
        }
      };

      socket.onclose = () => {
        session.isConnected = false;
        this.updateTabsSignal();
        if (this.activeTabId() === session.id) {
          this.terminalStatus.set('Disconnected');
        }
      };
    } catch {
      session.isConnected = false;
      this.updateTabsSignal();
      this.terminalStatus.set('Failed to connect');
    }
  }

  // General terminal commands
  setTheme(isDark: boolean): void {
    this.isDarkMode = isDark;
    this.sessions.forEach((s) => {
      s.term.options.theme = this.getTheme(isDark);
    });
  }

  fit(tabId?: string): void {
    const targetId = tabId || this.activeTabId();
    const session = targetId ? this.sessions.get(targetId) : null;
    if (
      session &&
      session.fitAddon &&
      session.term.element &&
      session.term.element.clientHeight > 0 &&
      session.term.element.clientWidth > 0
    ) {
      try {
        session.fitAddon.fit();
      } catch {
        // Safe fallback
      }
    }
  }

  focus(tabId?: string): void {
    const targetId = tabId || this.activeTabId();
    const session = targetId ? this.sessions.get(targetId) : null;
    if (session) {
      setTimeout(() => session.term.focus(), 20);
    }
  }

  syncFiles(files: Record<string, string>, lockedFiles?: string[]): Promise<void> {
    // 1. Pass to active websocket stream immediately if connected or queue for connect
    const active = this.getActiveSession();
    if (active && active.socket && active.socket.readyState === WebSocket.OPEN) {
      active.socket.send(
        JSON.stringify({
          action: 'sync_files',
          files,
          lockedFiles: lockedFiles || [],
        }),
      );
    } else {
      this.pendingSyncFiles = {
        files: { ...this.pendingSyncFiles?.files, ...files },
        lockedFiles: lockedFiles || this.pendingSyncFiles?.lockedFiles || [],
      };
    }

    // 2. Atomic REST disk sync with transient fsnotify self-change suppression
    return this.workspaceSyncService
      .syncWorkspace(this.currentProjectId, files, lockedFiles)
      .then(() => {})
      .catch((err) => {
        console.warn('[LiveTerminalService] Atomic workspace sync warning:', err);
      });
  }

  runCommand(command: string, files?: Record<string, string>) {
    const active = this.getActiveSession();
    if (!active || !active.socket || active.socket.readyState !== WebSocket.OPEN) {
      this.pendingCommands.push({ command, files });
      if (active) this.connectSession(active);
      return;
    }

    active.socket.send(
      JSON.stringify({
        action: 'run_command',
        data: command,
        files: files || {},
      }),
    );
  }

  sendInput(data: string) {
    const active = this.getActiveSession();
    if (active && active.socket && active.socket.readyState === WebSocket.OPEN) {
      active.socket.send(data);
    }
  }

  clear(tabId?: string) {
    const targetId = tabId || this.activeTabId();
    const session = targetId ? this.sessions.get(targetId) : null;
    session?.term.clear();
  }

  restart(tabId?: string) {
    const targetId = tabId || this.activeTabId();
    const session = targetId ? this.sessions.get(targetId) : null;
    if (session) {
      if (session.socket) {
        session.socket.close();
        session.socket = null;
      }
      session.term.reset();
      this.connectSession(session);
    }
  }

  setProject(projectId: string, projectName?: string): void {
    if (projectName) {
      this.currentProjectName = projectName;
    }
    if (projectId && projectId !== this.currentProjectId) {
      this.currentProjectId = projectId;
      this.destroyAllSessions();
      if (this.hostContainer) {
        this.createTab('Terminal 1');
      }
    }
  }

  connect(projectId?: string, projectName?: string) {
    if (projectId) this.currentProjectId = projectId;
    if (projectName) this.currentProjectName = projectName;
    const active = this.getActiveSession();
    if (active) {
      this.connectSession(active);
    } else if (this.sessions.size === 0) {
      this.createTab('Terminal 1');
    }
  }

  private destroyAllSessions(): void {
    this.sessions.forEach((s) => {
      if (s.socket) {
        s.socket.close();
        s.socket = null;
      }
      try {
        s.term.dispose();
      } catch {
        // Safe
      }
      if (s.wrapperEl.parentNode) {
        s.wrapperEl.parentNode.removeChild(s.wrapperEl);
      }
    });
    this.sessions.clear();
    this.updateTabsSignal();
    this.activeTabId.set('');
  }

  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.destroyAllSessions();
    this.terminalStatus.set('Closed');
  }
}
