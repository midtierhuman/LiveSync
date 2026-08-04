import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { appEndpoints } from '../app-endpoints';
import { AuthService } from './auth.service';

export interface PackageItem {
  name: string;
  version: string;
}

export interface PackageInstallResponse {
  success: boolean;
  language: string;
  packageName: string;
  message: string;
  output: string;
}

@Injectable({
  providedIn: 'root',
})
export class PackageManagerService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly isInstalling = signal<boolean>(false);
  readonly installedPackages = signal<PackageItem[]>([]);
  readonly lastInstallOutput = signal<string>('');
  readonly installError = signal<string>('');

  async fetchInstalledPackages(language: string = 'python'): Promise<PackageItem[]> {
    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/list?language=${encodeURIComponent(language)}`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ language: string; packages: PackageItem[] }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      const pkgs = res?.packages || [];
      this.installedPackages.set(pkgs);
      return pkgs;
    } catch (err) {
      console.warn('Failed to fetch installed packages:', err);
      return [];
    }
  }

  async installPackage(packageName: string, language: string = 'python'): Promise<PackageInstallResponse> {
    this.isInstalling.set(true);
    this.lastInstallOutput.set('');
    this.installError.set('');

    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/install`;

    try {
      const res = await firstValueFrom(
        this.http.post<PackageInstallResponse>(
          url,
          {
            language,
            package_name: packageName,
          },
          {
            headers: this.getAuthHeaders(),
          },
        ),
      );

      this.lastInstallOutput.set(res.output || res.message);
      if (res.success) {
        await this.fetchInstalledPackages(language);
      } else {
        this.installError.set(res.message);
      }
      return res;
    } catch (err: any) {
      const errMsg = err?.error?.message || err?.message || 'Package installation failed.';
      this.installError.set(errMsg);
      this.lastInstallOutput.set(errMsg);
      return {
        success: false,
        language,
        packageName,
        message: errMsg,
        output: errMsg,
      };
    } finally {
      this.isInstalling.set(false);
    }
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = this.authService.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
