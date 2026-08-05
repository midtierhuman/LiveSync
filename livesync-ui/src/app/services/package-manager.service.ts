import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { appEndpoints } from '../app-endpoints';
import { AuthService } from './auth.service';

export interface PackageItem {
  name: string;
  version: string;
}

export interface CatalogPackage {
  name: string;
  description: string;
  category?: string;
  version?: string;
}

export interface PackageInstallResponse {
  success: boolean;
  language: string;
  package_name: string;
  message: string;
  output: string;
}

export interface PackageLanguageSupport {
  requested_language: string;
  supported: boolean;
  package_language: string | null;
  package_display_name: string | null;
  message: string;
}

export interface ToastNotice {
  type: 'success' | 'error' | 'info';
  text: string;
}

@Injectable({
  providedIn: 'root',
})
export class PackageManagerService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly isSearching = signal<boolean>(false);
  readonly installedPackages = signal<PackageItem[]>([]);
  readonly searchResults = signal<CatalogPackage[]>([]);
  readonly popularPackages = signal<CatalogPackage[]>([]);
  readonly packageLanguageSupport = signal<PackageLanguageSupport | null>(null);
  readonly packageLanguageSupportLoading = signal<boolean>(false);

  // Track per-package loading states
  readonly installingPackages = signal<Set<string>>(new Set());
  readonly uninstallingPackages = signal<Set<string>>(new Set());

  readonly lastInstallOutput = signal<string>('');
  readonly installError = signal<string>('');
  readonly activeTab = signal<'discover' | 'installed' | 'output'>('discover');
  readonly selectedCategory = signal<string>('All');

  readonly toastNotice = signal<ToastNotice | null>(null);

  // Fast map lookup to check if package is already installed
  readonly installedPackageMap = computed(() => {
    const map = new Map<string, string>();
    for (const item of this.installedPackages()) {
      map.set(item.name.toLowerCase(), item.version);
    }
    return map;
  });

  private searchSubject = new Subject<{ query: string; language: string }>();

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(250),
        distinctUntilChanged((prev, curr) => prev.query === curr.query && prev.language === curr.language),
        switchMap(({ query, language }) => this.executeSearch(query, language)),
      )
      .subscribe({
        next: (results) => {
          this.searchResults.set(results);
          this.isSearching.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.isSearching.set(false);
        },
      });
  }

  showToast(text: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.toastNotice.set({ text, type });
    setTimeout(() => {
      if (this.toastNotice()?.text === text) {
        this.toastNotice.set(null);
      }
    }, 4000);
  }

  async fetchPopularPackages(language: string = 'python'): Promise<CatalogPackage[]> {
    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/popular?language=${encodeURIComponent(language)}`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ language: string; packages: CatalogPackage[] }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      const pkgs = res?.packages || [];
      this.popularPackages.set(pkgs);
      return pkgs;
    } catch {
      return [];
    }
  }

  async fetchLanguageSupport(language: string): Promise<PackageLanguageSupport> {
    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/support?language=${encodeURIComponent(language)}`;

    this.packageLanguageSupportLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<PackageLanguageSupport>(url, {
          headers: this.getAuthHeaders(),
        }),
      );

      this.packageLanguageSupport.set(res);
      return res;
    } catch (err: any) {
      const fallback: PackageLanguageSupport = {
        requested_language: language,
        supported: false,
        package_language: null,
        package_display_name: null,
        message: err?.error?.detail || err?.error?.message || err?.message || 'Package support check failed.',
      };
      this.packageLanguageSupport.set(fallback);
      return fallback;
    } finally {
      this.packageLanguageSupportLoading.set(false);
    }
  }

  searchPackagesReactive(query: string, language: string = 'python'): void {
    const q = (query || '').trim();
    if (!q) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }
    this.isSearching.set(true);
    this.searchSubject.next({ query: q, language });
  }

  private async executeSearch(query: string, language: string): Promise<CatalogPackage[]> {
    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/search?q=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ query: string; language: string; results: CatalogPackage[] }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      return res?.results || [];
    } catch {
      return [];
    }
  }

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
    const pkgLower = packageName.toLowerCase().trim();
    const activeInstalling = new Set(this.installingPackages());
    activeInstalling.add(pkgLower);
    this.installingPackages.set(activeInstalling);

    this.installError.set('');
    this.showToast(`Installing '${packageName}'...`, 'info');

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
        this.installError.set('');
        this.showToast(`Successfully installed '${packageName}'!`, 'success');
      } else {
        this.installError.set(res.message);
        this.showToast(`Failed to install '${packageName}'.`, 'error');
      }
      return res;
    } catch (err: any) {
      const errMsg = err?.error?.message || err?.message || 'Package installation failed.';
      this.installError.set(errMsg);
      this.lastInstallOutput.set(errMsg);
      this.showToast(errMsg, 'error');
      return {
        success: false,
        language,
        package_name: packageName,
        message: errMsg,
        output: errMsg,
      };
    } finally {
      const doneInstalling = new Set(this.installingPackages());
      doneInstalling.delete(pkgLower);
      this.installingPackages.set(doneInstalling);
    }
  }

  async uninstallPackage(packageName: string, language: string = 'python'): Promise<PackageInstallResponse> {
    const pkgLower = packageName.toLowerCase().trim();
    const activeUninstalling = new Set(this.uninstallingPackages());
    activeUninstalling.add(pkgLower);
    this.uninstallingPackages.set(activeUninstalling);

    this.installError.set('');
    this.showToast(`Uninstalling '${packageName}'...`, 'info');

    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/uninstall`;

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
        this.installError.set('');
        this.showToast(`Uninstalled '${packageName}'.`, 'success');
      } else {
        this.installError.set(res.message);
        this.showToast(`Failed to uninstall '${packageName}'.`, 'error');
      }
      return res;
    } catch (err: any) {
      const errMsg = err?.error?.message || err?.message || 'Package uninstall failed.';
      this.installError.set(errMsg);
      this.lastInstallOutput.set(errMsg);
      this.showToast(errMsg, 'error');
      return {
        success: false,
        language,
        package_name: packageName,
        message: errMsg,
        output: errMsg,
      };
    } finally {
      const doneUninstalling = new Set(this.uninstallingPackages());
      doneUninstalling.delete(pkgLower);
      this.uninstallingPackages.set(doneUninstalling);
    }
  }

  isPackageInstalling(packageName: string): boolean {
    return this.installingPackages().has(packageName.toLowerCase().trim());
  }

  isPackageUninstalling(packageName: string): boolean {
    return this.uninstallingPackages().has(packageName.toLowerCase().trim());
  }

  getInstalledVersion(packageName: string): string | undefined {
    return this.installedPackageMap().get(packageName.toLowerCase().trim());
  }

  private getAuthHeaders(): { [header: string]: string } {
    const token = this.authService.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
