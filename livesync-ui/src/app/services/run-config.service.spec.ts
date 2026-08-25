import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
      'findTabByName',
    ]);
    mockLiveTerminal.createTab.and.returnValue('tab-run-1');
    mockLiveTerminal.findTabByName.and.returnValue(null);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
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
    const custom = service.addCustomProfile('Run Custom Server', 'npm run start:api', 'custom');
    expect(custom.id).toContain('custom-');
    expect(service.selectedProfileId()).toBe(custom.id);
    expect(service.selectedProfile().name).toBe('Run Custom Server');
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

  it('should reuse existing tab when executing profile if tab already exists', async () => {
    mockLiveTerminal.findTabByName.and.returnValue('tab-existing-run');
    const profile = service.selectedProfile();
    await service.runProfile(profile, 'app.js');

    expect(mockLiveTerminal.createTab).not.toHaveBeenCalled();
    expect(mockLiveTerminal.switchTab).toHaveBeenCalledWith('tab-existing-run');
  });

  it('should format environment variables using POSIX bash export syntax', async () => {
    const profile: RunProfile = {
      id: 'test-env',
      name: 'Env Test',
      language: 'node',
      commandTemplate: 'node ${file}',
      envVars: { NODE_ENV: 'production' },
    };
    service.addEnvVar('PORT', '8080');

    await service.runProfile(profile, 'index.js');
    await new Promise((r) => setTimeout(r, 250));

    expect(mockLiveTerminal.runCommand).toHaveBeenCalled();
    const calledCmd = (mockLiveTerminal.runCommand.calls.mostRecent().args[0] as string);
    expect(calledCmd).toContain('export NODE_ENV="production"');
    expect(calledCmd).toContain('export PORT="8080"');
    expect(calledCmd).not.toContain('$env:');
  });
});
