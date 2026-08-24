import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HealthCheckService } from './health-check.service';

describe('HealthCheckService', () => {
  let service: HealthCheckService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthCheckService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.services().length).toBe(4);
  });

  it('should open and close health modal', () => {
    service.openModal();
    expect(service.showHealthModal()).toBeTrue();

    service.closeModal();
    expect(service.showHealthModal()).toBeFalse();
  });
});
