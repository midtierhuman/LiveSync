import { TestBed } from '@angular/core/testing';
import { AiAgentService, AI_AGENT_PROVIDERS } from './ai-agent.service';

describe('AiAgentService', () => {
  let service: AiAgentService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AiAgentService],
    });
    service = TestBed.inject(AiAgentService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with default Google Antigravity provider', () => {
    expect(service.activeProviderId()).toBe('antigravity');
    expect(service.activeProvider().name).toBe('Google Antigravity');
    expect(service.isAntigravityConnected()).toBeFalse();
  });

  it('should save Antigravity API key and report connected status (FEAT-14)', () => {
    service.setAntigravityKey('AIzaSyTestKey12345');
    expect(service.antigravityKey()).toBe('AIzaSyTestKey12345');
    expect(service.isAntigravityConnected()).toBeTrue();
    expect(service.isCurrentProviderConnected()).toBeTrue();
    expect(service.getActiveApiKey()).toBe('AIzaSyTestKey12345');
    expect(localStorage.getItem('livesync_ai_key_antigravity')).toBe('AIzaSyTestKey12345');
  });

  it('should switch agent providers smoothly', () => {
    service.setActiveProvider('local');
    expect(service.activeProviderId()).toBe('local');
    expect(service.activeProvider().name).toBe('Local LLM');
    expect(service.isCurrentProviderConnected()).toBeTrue(); // Local is always connected
    expect(localStorage.getItem('livesync_ai_active_provider')).toBe('local');
  });

  it('should toggle whole-project context preference and persist', () => {
    expect(service.includeProjectContext()).toBeTrue();
    service.toggleProjectContext();
    expect(service.includeProjectContext()).toBeFalse();
    expect(localStorage.getItem('livesync_ai_whole_project_context')).toBe('false');
    service.toggleProjectContext();
    expect(service.includeProjectContext()).toBeTrue();
    expect(localStorage.getItem('livesync_ai_whole_project_context')).toBe('true');
  });

  it('should disconnect provider cleanly', () => {
    service.setAntigravityKey('AIzaSyTestKey12345');
    expect(service.isAntigravityConnected()).toBeTrue();
    service.disconnectProvider('antigravity');
    expect(service.antigravityKey()).toBe('');
    expect(service.isAntigravityConnected()).toBeFalse();
    expect(localStorage.getItem('livesync_ai_key_antigravity')).toBeNull();
  });
});
