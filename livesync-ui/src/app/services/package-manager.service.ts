import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject, from, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
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
  readonly packageLanguageSupport = signal<PackageLanguageSupport | null>({
    requested_language: 'python',
    supported: true,
    package_language: 'python',
    package_display_name: 'Python (pip)',
    message: 'Python packages ready',
  });
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

  private readonly destroyRef = inject(DestroyRef);
  private searchSubject = new Subject<{ query: string; language: string }>();

  constructor() {
    const sub = this.searchSubject
      .pipe(
        debounceTime(250),
        distinctUntilChanged((prev, curr) => prev.query === curr.query && prev.language === curr.language),
        switchMap(({ query, language }) =>
          from(this.executeSearch(query, language)).pipe(
            catchError((err) => {
              console.warn('Package search query error:', err);
              return of([] as CatalogPackage[]);
            }),
          ),
        ),
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

    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
    });

    void this.fetchPopularPackages('python');
  }

  showToast(text: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const notice: ToastNotice = { text, type };
    this.toastNotice.set(notice);
    setTimeout(() => {
      if (this.toastNotice() === notice) {
        this.toastNotice.set(null);
      }
    }, 4000);
  }

  async fetchPopularPackages(language: string = 'python'): Promise<CatalogPackage[]> {
    const lang = (language || 'python').toLowerCase();
    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/?language=${encodeURIComponent(lang)}`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ query?: string; packages?: CatalogPackage[]; results?: CatalogPackage[] }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      const pkgs = res?.packages || res?.results || [];
      this.popularPackages.set(pkgs);
      return pkgs;
    } catch (err) {
      console.warn('Live package registry query failed:', err);
      this.popularPackages.set([]);
      return [];
    }
  }

  async fetchLanguageSupport(language: string): Promise<PackageLanguageSupport> {
    const lang = (language || 'python').toLowerCase();
    const isJS = ['javascript', 'typescript', 'js', 'ts', 'node'].includes(lang);
    const isPy = ['python', 'py'].includes(lang);

    const support: PackageLanguageSupport = {
      requested_language: language,
      supported: isJS || isPy,
      package_language: isJS ? 'npm' : isPy ? 'python' : null,
      package_display_name: isJS ? 'Node.js (npm)' : isPy ? 'Python (pip)' : null,
      message: isJS || isPy ? 'Package manager ready' : `${language} packages not supported yet`,
    };

    this.packageLanguageSupport.set(support);
    return support;
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
    const url = `${sandboxBase}/api/packages/?query=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ query?: string; packages?: CatalogPackage[]; results?: CatalogPackage[] }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      const items = res?.packages || res?.results || [];
      return items;
    } catch (err) {
      console.warn('Live package search failed:', err);
      return [];
    }
  }

  async fetchInstalledPackages(language: string = 'python'): Promise<PackageItem[]> {
    const sandboxBase = appEndpoints.sandboxBaseUrl || appEndpoints.apiBaseUrl || '';
    const url = `${sandboxBase}/api/packages/?language=${encodeURIComponent(language)}`;

    try {
      const res = await firstValueFrom(
        this.http.get<{ query?: string; packages?: CatalogPackage[] }>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      if (res?.packages && res.packages.length > 0) {
        const topInstalled: PackageItem[] = res.packages.slice(0, 3).map((p) => ({
          name: p.name,
          version: p.version || 'installed',
        }));
        this.installedPackages.set(topInstalled);
        return topInstalled;
      }
    } catch {
      // Ignore
    }
    return this.installedPackages();
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
