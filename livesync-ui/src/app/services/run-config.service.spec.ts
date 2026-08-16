import { TestBed } from '@angular/core/testing';
import { RunConfigService, RunProfile } from './run-config.service';
import { LiveTerminalService } from './live-terminal.service';

describe('RunConfigService', () => {
  let service: RunConfigService;
  let mockLiveTerminal: jasmine.SpyObj<LiveTerminalService>;

  beforeEach(() => {
    mockLiveTerminal = jasmine.createSpyObj('LiveTerminalService', [
      'createTab',
      'switchTab',
      'sendInput',
      'runCommand',
    ]);
    mockLiveTerminal.createTab.and.returnValue('tab-run-1');

    TestBed.configureTestingModule({
      providers: [
        RunConfigService,
        { provide: LiveTerminalService, useValue: mockLiveTerminal },
      ],
    });

    service = TestBed.inject(RunConfigService);
  });

  it('should initialize with default profiles and select default profile', () => {
    expect(service.profiles().length).toBeGreaterThan(0);
    expect(service.selectedProfile()).toBeDefined();
  });

  it('should build execution command substituting file parameter', () => {
    const profile: RunProfile = {
      id: 'test-node',
      name: 'Node Test',
      language: 'node',
      commandTemplate: 'node ${file}',
      envVars: {},
    };

    const cmd = service.buildExecutionCommand(profile, 'src/index.js');
    expect(cmd).toBe('node src/index.js');
  });

  it('should add custom profile and select it', () => {
    const custom = service.addCustomProfile('Run Rust Server', 'cargo run', 'custom');
    expect(custom.id).toContain('custom-');
    expect(service.selectedProfileId()).toBe(custom.id);
    expect(service.selectedProfile().name).toBe('Run Rust Server');
  });

  it('should add and remove custom environment variables', () => {
    service.addEnvVar('DEBUG', 'true');
    expect(service.customEnvVars().some((v) => v.key === 'DEBUG')).toBeTrue();

    const idx = service.customEnvVars().findIndex((v) => v.key === 'DEBUG');
    service.removeEnvVar(idx);
    expect(service.customEnvVars().some((v) => v.key === 'DEBUG')).toBeFalse();
  });

  it('should execute run profile via live terminal', async () => {
    const profile = service.selectedProfile();
    await service.runProfile(profile, 'server.js');

    expect(mockLiveTerminal.createTab).toHaveBeenCalled();
    expect(mockLiveTerminal.switchTab).toHaveBeenCalledWith('tab-run-1');
  });
});
