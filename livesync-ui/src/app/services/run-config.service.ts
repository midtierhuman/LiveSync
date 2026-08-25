import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LiveTerminalService } from './live-terminal.service';
import { AuthService } from './auth.service';
import { appEndpoints } from '../app-endpoints';

export type SupportedLanguage = 'node' | 'python' | 'custom';

export interface RunProfile {
  id: string;
  name: string;
  language: SupportedLanguage;
  commandTemplate: string;
  args?: string;
  envVars: Record<string, string>;
  isCustom?: boolean;
}

export interface RunExecutionRequest {
  projectId: string;
  entrypoint: string;
  revision?: number;
  overlay?: Record<string, string>;
  command?: string;
  language?: string;
}

export interface RunExecutionResponse {
  executionId: string;
  projectId: string;
  status: string;
  accessLevel: string;
  message: string;
  sandboxDir?: string;
  durationMs?: number;
}

export interface RunExecutionResult {
  profileId: string;
  profileName: string;
  command: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'running' | 'success' | 'failed';
}

const DEFAULT_PROFILES: RunProfile[] = [
  {
    id: 'py-fastapi',
    name: 'FastAPI: uvicorn (Port 8000)',
    language: 'python',
    commandTemplate: 'uvicorn main:app --reload --port 8000',
    envVars: { PYTHONUNBUFFERED: '1', PORT: '8000' },
  },
  {
    id: 'py-fastapi-dev',
    name: 'FastAPI: fastapi dev',
    language: 'python',
    commandTemplate: 'fastapi dev main.py',
    envVars: { PYTHONUNBUFFERED: '1' },
  },
  {
    id: 'py-run-file',
    name: 'Python 3: Run Active File',
    language: 'python',
    commandTemplate: 'python ${file}',
    envVars: { PYTHONUNBUFFERED: '1' },
  },
  {
    id: 'py-pytest',
    name: 'Python 3: pytest',
    language: 'python',
    commandTemplate: 'pytest -v',
    envVars: {},
  },
  {
    id: 'node-webapi',
    name: 'Node.js: Run Server (server.js / index.js)',
    language: 'node',
    commandTemplate: 'node ${file}',
    envVars: { NODE_ENV: 'development', PORT: '3000' },
  },
  {
    id: 'node-run-file',
    name: 'Node.js: Run Active File',
    language: 'node',
    commandTemplate: 'node ${file}',
    envVars: { NODE_ENV: 'development' },
  },
  {
    id: 'node-npm-dev',
    name: 'Node.js: npm run dev',
    language: 'node',
    commandTemplate: 'npm run dev',
    envVars: { NODE_ENV: 'development', PORT: '3000' },
  },
  {
    id: 'node-npm-test',
    name: 'Node.js: npm test',
    language: 'node',
    commandTemplate: 'npm test',
    envVars: { CI: 'true' },
  },
  {
    id: 'ts-node-run',
    name: 'TypeScript: npx ts-node',
    language: 'node',
    commandTemplate: 'npx ts-node ${file}',
    envVars: {},
  },
];

const STORAGE_KEY = 'livesync_run_profiles';
const SELECTED_PROFILE_KEY = 'livesync_selected_run_profile';

@Injectable({
  providedIn: 'root',
})
export class RunConfigService {
  private readonly liveTerminalService = inject(LiveTerminalService);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly profiles = signal<RunProfile[]>(this.loadProfiles());
  readonly selectedProfileId = signal<string>(this.loadSelectedProfileId());
  readonly customEnvVars = signal<Array<{ key: string; value: string }>>([
    { key: 'PORT', value: '3000' },
  ]);

  readonly isRunning = signal<boolean>(false);
  readonly lastExecution = signal<RunExecutionResult | null>(null);

  readonly selectedProfile = computed(() => {
    const id = this.selectedProfileId();
    return this.profiles().find((p) => p.id === id) || this.profiles()[0] || DEFAULT_PROFILES[0];
  });

  private loadProfiles(): RunProfile[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [...DEFAULT_PROFILES];
  }

  private loadSelectedProfileId(): string {
    try {
      const saved = localStorage.getItem(SELECTED_PROFILE_KEY);
      if (saved) return saved;
    } catch {}
    return 'node-run-file';
  }

  private saveProfiles(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles()));
    } catch {}
  }

  selectProfile(id: string): void {
    this.selectedProfileId.set(id);
    try {
      localStorage.setItem(SELECTED_PROFILE_KEY, id);
    } catch {}
  }

  addCustomProfile(name: string, command: string, language: SupportedLanguage = 'custom'): RunProfile {
    const newProfile: RunProfile = {
      id: `custom-${Date.now()}`,
      name: name.trim() || 'Custom Profile',
      language,
      commandTemplate: command.trim() || 'echo "Running..."',
      envVars: {},
      isCustom: true,
    };

    this.profiles.update((list) => [...list, newProfile]);
    this.saveProfiles();
    this.selectProfile(newProfile.id);
    return newProfile;
  }

  deleteProfile(id: string): void {
    this.profiles.update((list) => list.filter((p) => p.id !== id));
    this.saveProfiles();
    if (this.selectedProfileId() === id) {
      const first = this.profiles()[0];
      if (first) this.selectProfile(first.id);
    }
  }

  addEnvVar(key: string = '', value: string = ''): void {
    this.customEnvVars.update((vars) => [...vars, { key, value }]);
  }

  removeEnvVar(index: number): void {
    this.customEnvVars.update((vars) => vars.filter((_, i) => i !== index));
  }

  updateEnvVar(index: number, key: string, value: string): void {
    this.customEnvVars.update((vars) =>
      vars.map((v, i) => (i === index ? { key, value } : v))
    );
  }

  buildExecutionCommand(profile: RunProfile, activeFilePath: string = 'main'): string {
    const file = activeFilePath || 'main';
    let cmd = profile.commandTemplate.replace(/\$\{file\}/g, file);
    if (profile.args) {
      cmd += ` ${profile.args}`;
    }
    return cmd;
  }

  async executeRun(request: RunExecutionRequest): Promise<RunExecutionResponse | null> {
    try {
      const token = this.authService.token();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const url = `${appEndpoints.sandboxBaseUrl}/api/execution/run`;
      const resp = await firstValueFrom(
        this.http.post<RunExecutionResponse>(url, request, { headers })
      );
      return resp;
    } catch (err) {
      console.warn('Execution run request failed:', err);
      return null;
    }
  }

  async runProfile(
    profile: RunProfile,
    activeFilePath: string = 'main',
    overlayOrSnapshot?: Record<string, string>,
    projectId?: string
  ): Promise<void> {
    const fullCmd = this.buildExecutionCommand(profile, activeFilePath);
    const tabName = `run: ${profile.name.split(':')[0] || profile.name}`;

    if (projectId) {
      void this.executeRun({
        projectId,
        entrypoint: activeFilePath,
        overlay: overlayOrSnapshot,
        command: fullCmd,
        language: profile.language,
      });
    }

    const envEntries = [
      ...Object.entries(profile.envVars || {}),
      ...this.customEnvVars().filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value.trim()]),
    ];

    let executionCmd = fullCmd;
    if (envEntries.length > 0) {
      const envExports = envEntries.map(([k, v]) => `export ${k}="${v}"`).join('; ');
      executionCmd = `${envExports}; ${fullCmd}`;
    }

    const execResult: RunExecutionResult = {
      profileId: profile.id,
      profileName: profile.name,
      command: fullCmd,
      startTime: Date.now(),
      status: 'running',
    };
    this.lastExecution.set(execResult);
    this.isRunning.set(true);

    // 1. Reuse existing run tab or create new
    let tabId = this.liveTerminalService.findTabByName(tabName);
    if (!tabId) {
      tabId = this.liveTerminalService.createTab(tabName);
    }
    this.liveTerminalService.switchTab(tabId);

    // 2. Dispatch command to live terminal (backend materializes from authoritative store)
    setTimeout(() => {
      this.liveTerminalService.runCommand(executionCmd);
      setTimeout(() => {
        this.isRunning.set(false);
        const duration = Date.now() - execResult.startTime;
        this.lastExecution.update((curr) =>
          curr ? { ...curr, endTime: Date.now(), durationMs: duration, status: 'success' } : null
        );
      }, 1000);
    }, 150);
  }
}
