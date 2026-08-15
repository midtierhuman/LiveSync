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
        <div class="modal-compact" (click)="$event.stopPropagation()">
          
          <!-- Header -->
          <div class="modal-header">
            <div class="header-left">
              <mat-icon class="header-icon">note_add</mat-icon>
              <h3>New File</h3>
            </div>
            <button class="btn-close" (click)="cancel.emit()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="modal-body">
            <!-- Destination Folder Selector -->
            <div class="form-group">
              <label class="field-label">Target Workspace</label>
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

            <!-- File Name Input -->
            <div class="form-group">
              <label class="field-label">File Name</label>
              <div class="input-wrapper">
                <input
                  type="text"
                  placeholder="e.g. main.py, index.ts, models.go..."
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
          </div>

          <!-- Actions -->
          <div class="modal-footer">
            <button (click)="cancel.emit()" class="btn-ghost">Cancel</button>
            <button
              (click)="onSubmit()"
              [disabled]="!fileName().trim() || !selectedFolderId()"
              class="btn-primary"
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
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    }

    .modal-compact {
      background: #161922;
      border: 1px solid #272d3d;
      border-radius: 6px;
      width: 90%;
      max-width: 400px;
      color: #f0f6fc;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid #232836;

      .header-left {
        display: flex;
        align-items: center;
        gap: 6px;

        .header-icon {
          color: #38bdf8;
          font-size: 16px;
          width: 16px;
          height: 16px;
        }

        h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #f0f6fc;
        }
      }

      .btn-close {
        background: transparent;
        border: none;
        color: #6e7681;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;

        &:hover {
          color: #f0f6fc;
        }

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }
    }

    .modal-body {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 5px;

        .field-label {
          font-size: 11.5px;
          font-weight: 500;
          color: #8b949e;
        }

        .folder-select {
          width: 100%;
          background: #0f1117;
          border: 1px solid #272d3d;
          color: #f0f6fc;
          border-radius: 4px;
          padding: 6px 8px;
          font-size: 12px;
          outline: none;
          box-sizing: border-box;
          cursor: pointer;

          &:focus {
            border-color: #38bdf8;
          }

          option {
            background: #161922;
            color: #f0f6fc;
          }
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;

          .file-name-input {
            width: 100%;
            background: #0f1117;
            border: 1px solid #272d3d;
            color: #f0f6fc;
            border-radius: 4px;
            padding: 6px 10px;
            padding-right: 70px;
            font-size: 12.5px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            outline: none;
            box-sizing: border-box;

            &:focus {
              border-color: #38bdf8;
            }

            &::placeholder {
              color: #484f58;
            }
          }

          .lang-pill {
            position: absolute;
            right: 6px;
            background: rgba(56, 189, 248, 0.12);
            border: 1px solid rgba(56, 189, 248, 0.25);
            color: #38bdf8;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: 3px;
            pointer-events: none;
            text-transform: uppercase;
          }
        }
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 14px;
      background: #12141c;
      border-top: 1px solid #232836;
      border-radius: 0 0 6px 6px;

      button {
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;

        &.btn-ghost {
          background: transparent;
          border: 1px solid #272d3d;
          color: #c9d1d9;

          &:hover {
            background: #1c212c;
          }
        }

        &.btn-primary {
          background: #0284c7;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ffffff;

          &:hover:not(:disabled) {
            background: #0369a1;
          }

          &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
        }
      }
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
    if (fn.endsWith('.js') || fn.endsWith('.mjs')) return 'JS';
    if (fn.endsWith('.ts')) return 'TS';
    if (fn.endsWith('.html')) return 'HTML';
    if (fn.endsWith('.css') || fn.endsWith('.scss')) return 'CSS';
    if (fn.endsWith('.json')) return 'JSON';
    if (fn.endsWith('.md')) return 'MD';
    if (fn.endsWith('.go')) return 'Go';
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
