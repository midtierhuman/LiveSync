import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { appEndpoints } from '../app-endpoints';

export interface UserInfo {
  id: string;
  email: string;
  userName: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  expiration: string;
  user: UserInfo;
}

export interface RegisterRequest {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  emailOrUsername: string;
  password: string;
}

export interface TokenResponse {
  token: string;
  user: UserInfo;
}

export interface AuthActionResult {
  success: boolean;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<UserInfo | null>(null);
  readonly isAuthenticated = signal(false);
  readonly isLoading = signal(false);
  readonly isInitialized = signal(false);
  readonly token = signal<string | null>(localStorage.getItem('auth_token'));

  private readonly apiUrl = `${appEndpoints.apiBaseUrl}/api/auth`;

  async initializeAuth(): Promise<void> {
    const token = localStorage.getItem('auth_token');
    if (token) {
      this.token.set(token);
      // Verify token is still valid
      try {
        await this.verifyToken();
      } catch (error) {
        console.warn('Token verification failed, logging out');
        this.clearAuth();
      }
    }
    this.isInitialized.set(true);
  }

  private clearAuth(): void {
    localStorage.removeItem('auth_token');
    this.token.set(null);
    this.user.set(null);
    this.isAuthenticated.set(false);
  }

  async verifyToken(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<UserInfo>(`${this.apiUrl}/me`));

      if (response) {
        this.user.set(response);
        this.isAuthenticated.set(true);
      } else {
        this.logout();
      }
    } catch (error) {
      this.logout();
    }
  }

  async signin(emailOrUsername: string, password: string): Promise<AuthActionResult> {
    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/login`, {
          emailOrUsername,
          password,
        }),
      );

      if (response.success && response.token && response.user) {
        localStorage.setItem('auth_token', response.token);
        this.token.set(response.token);
        this.user.set(response.user);
        this.isAuthenticated.set(true);
        return { success: true };
      }
      return { success: false, message: response.message || 'Sign in failed.' };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, message: this.extractApiErrorMessage(error, 'Sign in failed.') };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signup(
    email: string,
    password: string,
    confirmPassword: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthActionResult> {
    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/register`, {
          email,
          password,
          confirmPassword,
          firstName,
          lastName,
        }),
      );

      if (response.success && response.token && response.user) {
        localStorage.setItem('auth_token', response.token);
        this.token.set(response.token);
        this.user.set(response.user);
        this.isAuthenticated.set(true);
        return { success: true };
      }
      return { success: false, message: response.message || 'Failed to create account.' };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        success: false,
        message: this.extractApiErrorMessage(error, 'Failed to create account.'),
      };
    } finally {
      this.isLoading.set(false);
    }
  }

  logout(): void {
    this.clearAuth();
    this.router.navigate(['/']);
  }

  private extractApiErrorMessage(error: unknown, fallback: string): string {
    const httpError = error as HttpErrorResponse;
    const payload = httpError?.error;

    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const payloadMessage = (payload as { message?: unknown }).message;
      if (typeof payloadMessage === 'string' && payloadMessage.trim()) {
        return payloadMessage;
      }

      const title = (payload as { title?: unknown }).title;
      if (typeof title === 'string' && title.trim()) {
        return title;
      }

      const errors = (payload as { errors?: unknown }).errors;
      if (errors && typeof errors === 'object') {
        const messages = Object.values(errors as Record<string, unknown>)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        if (messages.length > 0) {
          return messages[0];
        }
      }
    }

    if (httpError?.message) {
      return httpError.message;
    }

    return fallback;
  }
}
