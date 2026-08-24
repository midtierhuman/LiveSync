import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const toastService = inject(ToastService);
  const token = authService.token();

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Do not show toast notifications for deliberate polling, ping, or known silent checks
      const isHealthOrSilent = req.url.includes('/health') || req.url.includes('/audit-logs');

      if (!isHealthOrSilent) {
        if (error.status === 401) {
          if (authService.isAuthenticated()) {
            toastService.warning('Session Expired', 'Your authentication session expired. Please log in again.');
          }
        } else if (error.status === 403) {
          toastService.error('Permission Denied', error.error?.message || 'You do not have permission to modify this document.');
        } else if (error.status === 429) {
          toastService.warning('Rate Limit Exceeded', 'Too many requests dispatched. Please wait a moment.');
        } else if (error.status >= 500 && error.status <= 504) {
          toastService.error('Service Unavailable', error.error?.message || 'LiveSync microservice is temporarily experiencing issues.');
        } else if (error.status === 0) {
          toastService.error('Network Offline', 'Unable to reach LiveSync server. Running with offline safety.');
        }
      }

      return throwError(() => error);
    }),
  );
};
