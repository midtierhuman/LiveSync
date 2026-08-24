import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add and dismiss error toast', () => {
    const id = service.error('Test Error', 'Something failed');
    expect(id).toBeTruthy();
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].type).toBe('error');

    service.dismiss(id);
    expect(service.toasts().length).toBe(0);
  });

  it('should deduplicate rapid identical toasts', () => {
    const id1 = service.warning('Rate Limit', 'Too fast');
    const id2 = service.warning('Rate Limit', 'Too fast');
    expect(id1).toBeTruthy();
    expect(id2).toBe('');
    expect(service.toasts().length).toBe(1);
  });
});
