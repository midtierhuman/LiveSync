import { Component, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

export interface TargetFolderOption {
  id: string;
  name: string;
  isShared?: boolean;
}

export interface CreateFileSubmitPayload {
  title: string;
  folderId: string;
}

@Component({
  selector: 'app-create-file-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="cancel.emit()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          
          <!-- Header -->
          <div class="modal-header">
            <div class="header-title">
              <mat-icon class="header-icon">note_add</mat-icon>
              <h2>Create New File</h2>
            </div>
            <button class="btn-icon-close" (click)="cancel.emit()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <p class="modal-subtitle">
            Files must reside within a project workspace folder.
          </p>

          <!-- Destination Folder Selector -->
          <div class="form-group">
            <label class="field-label">
              <mat-icon class="label-icon">folder</mat-icon> Destination Project / Folder
            </label>
            <div class="select-wrapper">
              <select
                class="folder-select"
                [ngModel]="selectedFolderId()"
                (ngModelChange)="selectedFolderId.set($event)"
              >
                @for (folder of availableFolders(); track folder.id) {
                  <option [value]="folder.id">
                    📁 {{ folder.name }}{{ folder.isShared ? ' (Shared)' : '' }}
                  </option>
                }
              </select>
            </div>
          </div>

          <!-- File Name Input -->
          <div class="form-group">
            <label class="field-label">
              <mat-icon class="label-icon">description</mat-icon> File Name & Extension
            </label>
            <div class="input-wrapper">
              <input
                type="text"
                placeholder="e.g. main.py, index.js, utils.py, App.java"
                [ngModel]="fileName()"
                (ngModelChange)="fileName.set($event)"
                (keydown.enter)="onSubmit()"
                (keydown.escape)="cancel.emit()"
                class="file-name-input"
                autofocus
              />
              @if (detectedLanguage(); as lang) {
                <span class="lang-pill">{{ lang }}</span>
              }
            </div>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button (click)="cancel.emit()" class="btn-cancel">Cancel</button>
            <button
              (click)="onSubmit()"
              [disabled]="!fileName().trim() || !selectedFolderId()"
              class="btn-submit"
            >
              Create File
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(12px);
      animation: fadeIn 0.15s ease-out;
    }

    .modal-card {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 20px;
      padding: 1.75rem;
      width: 90%;
      max-width: 480px;
      color: #f8fafc;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(56, 189, 248, 0.2);
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;

        .header-icon {
          color: #38bdf8;
          font-size: 22px;
          width: 22px;
          height: 22px;
        }

        h2 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          color: #f8fafc;
        }
      }

      .btn-icon-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        padding: 4px;

        &:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.1);
        }
      }
    }

    .modal-subtitle {
      margin: -0.5rem 0 0 0;
      font-size: 0.88rem;
      color: #94a3b8;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;

      .field-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.82rem;
        font-weight: 600;
        color: #cbd5e1;
        text-transform: uppercase;
        letter-spacing: 0.04em;

        .label-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          color: #38bdf8;
        }
      }
    }

    .select-wrapper {
      position: relative;

      .folder-select {
        width: 100%;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #f8fafc;
        border-radius: 10px;
        padding: 0.75rem 1rem;
        font-size: 0.95rem;
        outline: none;
        box-sizing: border-box;
        cursor: pointer;
        transition: all 0.15s ease;

        &:focus {
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }

        option {
          background: #1e293b;
          color: #f8fafc;
          padding: 0.5rem;
        }
      }
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;

      .file-name-input {
        width: 100%;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #f8fafc;
        border-radius: 10px;
        padding: 0.75rem 1rem;
        padding-right: 90px;
        font-size: 0.95rem;
        outline: none;
        box-sizing: border-box;
        transition: all 0.15s ease;

        &:focus {
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }
      }

      .lang-pill {
        position: absolute;
        right: 8px;
        background: rgba(56, 189, 248, 0.18);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 6px;
        pointer-events: none;
        text-transform: uppercase;
      }
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 0.5rem;

      .btn-cancel {
        padding: 0.6rem 1.1rem;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #cbd5e1;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.88rem;
        cursor: pointer;

        &:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #f8fafc;
        }
      }

      .btn-submit {
        padding: 0.6rem 1.25rem;
        background: #0284c7;
        border: none;
        color: #ffffff;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.88rem;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover:not(:disabled) {
          background: #0369a1;
          transform: translateY(-1px);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes popIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `]
})
export class CreateFileModalComponent {
  isOpen = input<boolean>(false);
  availableFolders = input<TargetFolderOption[]>([]);
  initialFolderId = input<string | null>(null);

  submit = output<CreateFileSubmitPayload>();
  cancel = output<void>();

  fileName = signal<string>('');
  selectedFolderId = signal<string>('');

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.fileName.set('');
        const init = this.initialFolderId();
        const folders = this.availableFolders();
        if (init && folders.some(f => f.id === init)) {
          this.selectedFolderId.set(init);
        } else if (folders.length > 0) {
          this.selectedFolderId.set(folders[0].id);
        } else {
          this.selectedFolderId.set('');
        }
      }
    });
  }

  detectedLanguage(): string | null {
    const fn = this.fileName().trim().toLowerCase();
    if (fn.endsWith('.py')) return 'Python';
    if (fn.endsWith('.js') || fn.endsWith('.mjs')) return 'JavaScript';
    if (fn.endsWith('.ts')) return 'TypeScript';
    if (fn.endsWith('.html')) return 'HTML';
    if (fn.endsWith('.css') || fn.endsWith('.scss')) return 'CSS';
    if (fn.endsWith('.json')) return 'JSON';
    if (fn.endsWith('.md')) return 'Markdown';
    if (fn.endsWith('.java')) return 'Java';
    return null;
  }

  onSubmit() {
    const title = this.fileName().trim();
    const folderId = this.selectedFolderId();
    if (title && folderId) {
      this.submit.emit({ title, folderId });
    }
  }
}
