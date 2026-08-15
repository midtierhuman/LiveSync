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
        <div class="modal-compact" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-left">
              <mat-icon class="header-icon">{{ getHeaderIcon() }}</mat-icon>
              <h3>Rename {{ getDisplayType() }}</h3>
            </div>
            <button class="btn-close" (click)="onCancel()" matTooltip="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <form (ngSubmit)="onSubmit()" class="modal-form">
            <div class="modal-body">
              <div class="form-group">
                <label for="renameInput">New {{ getDisplayType() }} Name</label>
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
                    <span class="badge-label">Type: <strong>{{ detectedLanguage().name }}</strong></span>
                  </div>
                }
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-ghost" (click)="onCancel()">Cancel</button>
              <button
                type="submit"
                class="btn-primary"
                [disabled]="!isValid()"
              >
                Save
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
        max-width: 380px;
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

      .modal-form {
        display: flex;
        flex-direction: column;
      }

      .modal-body {
        padding: 14px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;

        label {
          font-size: 11.5px;
          font-weight: 500;
          color: #8b949e;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;

          .input-icon {
            position: absolute;
            left: 8px;
            font-size: 15px;
            width: 15px;
            height: 15px;
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
            background: #0f1117;
            border: 1px solid #272d3d;
            color: #f0f6fc;
            border-radius: 4px;
            padding: 6px 10px 6px 28px;
            outline: none;
            font-size: 12.5px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            box-sizing: border-box;

            &:focus {
              border-color: #38bdf8;
            }

            &::placeholder {
              color: #484f58;
            }
          }
        }
      }

      .detected-badge {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 4px;
        font-size: 11px;
        color: #8b949e;

        .badge-dot {
          width: 6px;
          height: 6px;
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
          color: #f0f6fc;
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
            color: #fff;

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
        return { name: 'Python', icon: 'code', class: 'lang-py' };
      case 'js':
      case 'mjs':
        return { name: 'JavaScript', icon: 'javascript', class: 'lang-js' };
      case 'ts':
        return { name: 'TypeScript', icon: 'code', class: 'lang-ts' };
      case 'html':
        return { name: 'HTML', icon: 'html', class: 'lang-html' };
      case 'css':
      case 'scss':
        return { name: 'CSS/SCSS', icon: 'css', class: 'lang-css' };
      case 'json':
        return { name: 'JSON', icon: 'data_object', class: 'lang-json' };
      case 'md':
        return { name: 'Markdown', icon: 'description', class: 'lang-md' };
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
        return 'e.g. backend-service';
      case 'folder':
        return 'e.g. controllers, models...';
      case 'file':
        return 'e.g. main.py, index.ts...';
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
