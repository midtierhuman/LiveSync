import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  actionLabel?: string;
  actionHandler?: () => void;
  durationMs?: number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);
  private readonly recentToastHashes = new Set<string>();

  show(toast: Omit<ToastItem, 'id' | 'timestamp'>): string {
    const hash = `${toast.type}:${toast.title}:${toast.message}`;
    if (this.recentToastHashes.has(hash)) {
      return ''; // Deduplicate identical rapid alerts
    }
    this.recentToastHashes.add(hash);
    setTimeout(() => this.recentToastHashes.delete(hash), 3000);

    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fullToast: ToastItem = {
      ...toast,
      id,
      timestamp: Date.now(),
      durationMs: toast.durationMs ?? 4500,
    };

    this.toasts.update((prev) => [fullToast, ...prev].slice(0, 5));

    if (fullToast.durationMs && fullToast.durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, fullToast.durationMs);
    }

    return id;
  }

  error(title: string, message: string, actionLabel?: string, actionHandler?: () => void): string {
    return this.show({ type: 'error', title, message, actionLabel, actionHandler, durationMs: 6000 });
  }

  warning(title: string, message: string, actionLabel?: string, actionHandler?: () => void): string {
    return this.show({ type: 'warning', title, message, actionLabel, actionHandler, durationMs: 4500 });
  }

  info(title: string, message: string, actionLabel?: string, actionHandler?: () => void): string {
    return this.show({ type: 'info', title, message, actionLabel, actionHandler, durationMs: 3500 });
  }

  success(title: string, message: string, actionLabel?: string, actionHandler?: () => void): string {
    return this.show({ type: 'success', title, message, actionLabel, actionHandler, durationMs: 3000 });
  }

  dismiss(id: string): void {
    this.toasts.update((prev) => prev.filter((t) => t.id !== id));
  }

  clearAll(): void {
    this.toasts.set([]);
  }
}
