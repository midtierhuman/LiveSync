import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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

  private readonly apiUrl = 'https://localhost:7001/api/auth';

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

  async signin(emailOrUsername: string, password: string): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/login`, {
          emailOrUsername,
          password,
        })
      );

      if (response.success && response.token && response.user) {
        localStorage.setItem('auth_token', response.token);
        this.token.set(response.token);
        this.user.set(response.user);
        this.isAuthenticated.set(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Sign in error:', error);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  async signup(
    email: string,
    password: string,
    confirmPassword: string,
    firstName?: string,
    lastName?: string
  ): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.apiUrl}/register`, {
          email,
          password,
          confirmPassword,
          firstName,
          lastName,
        })
      );

      if (response.success && response.token && response.user) {
        localStorage.setItem('auth_token', response.token);
        this.token.set(response.token);
        this.user.set(response.user);
        this.isAuthenticated.set(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Sign up error:', error);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  logout(): void {
    this.clearAuth();
    this.router.navigate(['/']);
  }
}
