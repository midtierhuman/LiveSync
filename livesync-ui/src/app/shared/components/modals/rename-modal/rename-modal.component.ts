import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  computed,
  signal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type RenameItemType = 'project' | 'folder' | 'file';

@Component({
  selector: 'app-rename-modal',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (isOpen) {
      <div class="modal-overlay" (click)="onCancel()" (keydown.escape)="onCancel()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-icon-badge" [class.file-type]="itemType === 'file'" [class.folder-type]="itemType !== 'file'">
              <mat-icon>{{ getHeaderIcon() }}</mat-icon>
            </div>
            <div class="header-text">
              <h3>Rename {{ getDisplayType() }}</h3>
              <p>Enter a new name for <strong>{{ currentName }}</strong></p>
            </div>
            <button class="btn-close" (click)="onCancel()" matTooltip="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <form (ngSubmit)="onSubmit()" class="modal-form">
            <div class="form-group">
              <label for="renameInput">{{ getDisplayType() }} Name:</label>
              <div class="input-with-icon">
                @if (itemType === 'file') {
                  <mat-icon class="input-icon" [class]="detectedLanguage().class">
                    {{ detectedLanguage().icon }}
                  </mat-icon>
                } @else {
                  <mat-icon class="input-icon folder-icon">folder</mat-icon>
                }
                <input
                  #renameInput
                  id="renameInput"
                  type="text"
                  [ngModel]="nameValue()"
                  (ngModelChange)="nameValue.set($event)"
                  name="newName"
                  [placeholder]="getPlaceholder()"
                  class="name-input"
                  autocomplete="off"
                />
              </div>

              @if (itemType === 'file' && detectedLanguage().name) {
                <div class="detected-badge">
                  <span class="badge-dot" [class]="detectedLanguage().class"></span>
                  <span class="badge-label">Detected as <strong>{{ detectedLanguage().name }}</strong></span>
                </div>
              }
            </div>

            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="onCancel()">Cancel</button>
              <button
                type="submit"
                class="btn-submit"
                [disabled]="!isValid()"
              >
                <mat-icon>check</mat-icon> Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.82);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(12px);
      }

      .modal-card {
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 18px;
        padding: 1.75rem;
        width: 90%;
        max-width: 440px;
        color: #f8fafc;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7);
        animation: scaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes scaleIn {
        from {
          transform: scale(0.95);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .modal-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 1.5rem;

        .header-icon-badge {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;

          &.folder-type {
            background: rgba(220, 182, 122, 0.15);
            color: #dcb67a;
          }

          &.file-type {
            background: rgba(56, 189, 248, 0.15);
            color: #38bdf8;
          }

          mat-icon {
            font-size: 22px;
            width: 22px;
            height: 22px;
          }
        }

        .header-text {
          flex: 1;
          min-width: 0;

          h3 {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 700;
            color: #f8fafc;
          }

          p {
            margin: 0.25rem 0 0 0;
            font-size: 0.85rem;
            color: #94a3b8;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;

            strong {
              color: #cbd5e1;
            }
          }
        }

        .btn-close {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;

          &:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #f8fafc;
          }

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }
        }
      }

      .modal-form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #cbd5e1;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;

          .input-icon {
            position: absolute;
            left: 12px;
            font-size: 18px;
            width: 18px;
            height: 18px;
            pointer-events: none;

            &.folder-icon { color: #dcb67a; }
            &.lang-py { color: #38bdf8; }
            &.lang-js { color: #facc15; }
            &.lang-ts { color: #60a5fa; }
            &.lang-html { color: #f97316; }
            &.lang-css { color: #38bdf8; }
            &.lang-json { color: #a3e635; }
            &.lang-md { color: #cbd5e1; }
            &.lang-default { color: #94a3b8; }
          }

          .name-input {
            width: 100%;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: #f8fafc;
            border-radius: 8px;
            padding: 0.75rem 1rem 0.75rem 2.5rem;
            outline: none;
            font-size: 0.95rem;
            box-sizing: border-box;
            transition: all 0.15s ease;

            &:focus {
              border-color: #38bdf8;
              box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
            }
          }
        }
      }

      .detected-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        font-size: 0.78rem;
        color: #94a3b8;

        .badge-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;

          &.lang-py { background: #38bdf8; }
          &.lang-js { background: #facc15; }
          &.lang-ts { background: #60a5fa; }
          &.lang-html { background: #f97316; }
          &.lang-css { background: #38bdf8; }
          &.lang-json { background: #a3e635; }
          &.lang-md { background: #cbd5e1; }
          &.lang-default { background: #94a3b8; }
        }

        strong {
          color: #f8fafc;
        }
      }

      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 0.5rem;

        button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.15s ease;

          &.btn-cancel {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #cbd5e1;

            &:hover {
              background: rgba(255, 255, 255, 0.12);
              color: #f8fafc;
            }
          }

          &.btn-submit {
            background: #0284c7;
            border: none;
            color: #fff;

            &:hover:not(:disabled) {
              background: #0369a1;
              transform: translateY(-1px);
              box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
            }

            &:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            mat-icon {
              font-size: 17px;
              width: 17px;
              height: 17px;
            }
          }
        }
      }
    `,
  ],
})
export class RenameModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() itemType: RenameItemType = 'file';
  @Input() currentName = '';

  @Output() submitName = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('renameInput') renameInputRef?: ElementRef<HTMLInputElement>;

  nameValue = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.nameValue.set(this.currentName || '');
      setTimeout(() => {
        if (this.renameInputRef) {
          const el = this.renameInputRef.nativeElement;
          el.focus();
          // Select base name without extension for files
          const dotIdx = el.value.lastIndexOf('.');
          if (this.itemType === 'file' && dotIdx > 0) {
            el.setSelectionRange(0, dotIdx);
          } else {
            el.select();
          }
        }
      }, 50);
    }
  }

  detectedLanguage = computed(() => {
    const val = this.nameValue().trim();
    if (!val) return { name: '', icon: 'insert_drive_file', class: 'lang-default' };
    const ext = val.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py':
        return { name: 'Python (.py)', icon: 'code', class: 'lang-py' };
      case 'js':
      case 'mjs':
        return { name: 'JavaScript (.js)', icon: 'javascript', class: 'lang-js' };
      case 'ts':
        return { name: 'TypeScript (.ts)', icon: 'code', class: 'lang-ts' };
      case 'html':
        return { name: 'HTML (.html)', icon: 'html', class: 'lang-html' };
      case 'css':
      case 'scss':
        return { name: 'CSS/SCSS', icon: 'css', class: 'lang-css' };
      case 'json':
        return { name: 'JSON (.json)', icon: 'data_object', class: 'lang-json' };
      case 'md':
        return { name: 'Markdown (.md)', icon: 'description', class: 'lang-md' };
      default:
        return { name: '', icon: 'insert_drive_file', class: 'lang-default' };
    }
  });

  isValid(): boolean {
    const trimmed = this.nameValue().trim();
    return Boolean(trimmed && trimmed !== this.currentName.trim());
  }

  getHeaderIcon(): string {
    switch (this.itemType) {
      case 'project':
        return 'inventory_2';
      case 'folder':
        return 'folder';
      case 'file':
        return 'edit_note';
    }
  }

  getDisplayType(): string {
    switch (this.itemType) {
      case 'project':
        return 'Project';
      case 'folder':
        return 'Folder';
      case 'file':
        return 'File';
    }
  }

  getPlaceholder(): string {
    switch (this.itemType) {
      case 'project':
        return 'e.g. Backend-Service';
      case 'folder':
        return 'e.g. controllers, services, models...';
      case 'file':
        return 'e.g. main.py, server.js, index.ts...';
    }
  }

  onSubmit() {
    const val = this.nameValue().trim();
    if (val && val !== this.currentName.trim()) {
      this.submitName.emit(val);
    }
  }

  onCancel() {
    this.cancel.emit();
  }
}
