import { Injectable, signal, computed } from '@angular/core';

export interface AiAgentProvider {
  id: string;
  name: string;
  icon: string;
  badge: string;
  description: string;
  status: 'active' | 'coming_soon';
  helpUrl?: string;
  placeholder?: string;
}

export const AI_AGENT_PROVIDERS: AiAgentProvider[] = [
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    icon: 'bolt',
    badge: 'Default',
    description: 'High-throughput Gemini reasoning with 1M+ token whole-project workspace context.',
    status: 'active',
    helpUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'Paste your Google Antigravity / Gemini API Key (AIzaSy...)',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    icon: 'terminal',
    badge: 'Coming Soon',
    description: 'Specialized code completion and algorithmic function generation.',
    status: 'coming_soon',
    helpUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'Paste your OpenAI API Key (sk-...)',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    icon: 'psychology',
    badge: 'Coming Soon',
    description: 'Claude 3.7 Sonnet code reasoning and architecture design engine.',
    status: 'coming_soon',
    helpUrl: 'https://console.anthropic.com/',
    placeholder: 'Paste your Anthropic API Key (sk-ant-...)',
  },
  {
    id: 'local',
    name: 'Local LLM',
    icon: 'dns',
    badge: 'Offline',
    description: 'Direct zero-cloud connection to local llama.cpp / Ollama / Qwen2.5-Coder.',
    status: 'active',
    placeholder: 'http://127.0.0.1:8080/v1',
  },
];

@Injectable({
  providedIn: 'root',
})
export class AiAgentService {
  private readonly STORAGE_KEY_PREFIX = 'livesync_ai_key_';
  private readonly PROVIDER_STORAGE_KEY = 'livesync_ai_active_provider';
  private readonly CONTEXT_STORAGE_KEY = 'livesync_ai_whole_project_context';

  readonly providers = signal<AiAgentProvider[]>(AI_AGENT_PROVIDERS);
  readonly activeProviderId = signal<string>(this.getInitialProvider());
  readonly antigravityKey = signal<string>(this.getStoredKey('antigravity'));
  readonly codexKey = signal<string>(this.getStoredKey('codex'));
  readonly claudeKey = signal<string>(this.getStoredKey('claude'));
  readonly localLlmUrl = signal<string>(this.getStoredKey('local') || 'http://127.0.0.1:8080/v1');
  readonly includeProjectContext = signal<boolean>(this.getInitialContextPreference());
  readonly showConnectModal = signal<boolean>(false);

  readonly activeProvider = computed<AiAgentProvider>(() => {
    const p = this.providers().find((item) => item.id === this.activeProviderId());
    return p || this.providers()[0];
  });

  readonly isCurrentProviderConnected = computed<boolean>(() => {
    const pid = this.activeProviderId();
    if (pid === 'antigravity') {
      return !!this.antigravityKey().trim();
    }
    if (pid === 'codex') {
      return !!this.codexKey().trim();
    }
    if (pid === 'claude') {
      return !!this.claudeKey().trim();
    }
    if (pid === 'local') {
      return true;
    }
    return false;
  });

  readonly isAntigravityConnected = computed<boolean>(() => !!this.antigravityKey().trim());

  private getInitialProvider(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(this.PROVIDER_STORAGE_KEY) || 'antigravity';
    }
    return 'antigravity';
  }

  private getStoredKey(providerId: string): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${providerId}`) || '';
    }
    return '';
  }

  private getInitialContextPreference(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem(this.CONTEXT_STORAGE_KEY);
      return val !== null ? val === 'true' : true;
    }
    return true;
  }

  setActiveProvider(providerId: string): void {
    const exists = this.providers().find((p) => p.id === providerId);
    if (!exists) return;
    this.activeProviderId.set(providerId);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(this.PROVIDER_STORAGE_KEY, providerId);
    }
  }

  setAntigravityKey(key: string): void {
    const trimmed = (key || '').trim();
    this.antigravityKey.set(trimmed);
    if (typeof window !== 'undefined' && window.localStorage) {
      if (trimmed) {
        localStorage.setItem(`${this.STORAGE_KEY_PREFIX}antigravity`, trimmed);
      } else {
        localStorage.removeItem(`${this.STORAGE_KEY_PREFIX}antigravity`);
      }
    }
  }

  setProviderKey(providerId: string, key: string): void {
    const trimmed = (key || '').trim();
    if (providerId === 'antigravity') this.setAntigravityKey(trimmed);
    else if (providerId === 'codex') {
      this.codexKey.set(trimmed);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`${this.STORAGE_KEY_PREFIX}codex`, trimmed);
      }
    } else if (providerId === 'claude') {
      this.claudeKey.set(trimmed);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`${this.STORAGE_KEY_PREFIX}claude`, trimmed);
      }
    } else if (providerId === 'local') {
      this.localLlmUrl.set(trimmed);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`${this.STORAGE_KEY_PREFIX}local`, trimmed);
      }
    }
  }

  disconnectProvider(providerId: string): void {
    this.setProviderKey(providerId, '');
  }

  toggleProjectContext(): void {
    const next = !this.includeProjectContext();
    this.includeProjectContext.set(next);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(this.CONTEXT_STORAGE_KEY, String(next));
    }
  }

  openConnectModal(): void {
    this.showConnectModal.set(true);
  }

  closeConnectModal(): void {
    this.showConnectModal.set(false);
  }

  getActiveApiKey(): string | undefined {
    const pid = this.activeProviderId();
    if (pid === 'antigravity') {
      return this.antigravityKey() || undefined;
    }
    if (pid === 'codex') {
      return this.codexKey() || undefined;
    }
    if (pid === 'claude') {
      return this.claudeKey() || undefined;
    }
    return undefined;
  }
}
