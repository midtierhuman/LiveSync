import { Component, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-prompt-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="cancel.emit()">
        <div class="modal-prompt" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-title">
              @if (icon()) {
                <mat-icon class="header-icon">{{ icon() }}</mat-icon>
              }
              <h2>{{ title() }}</h2>
            </div>
            <button class="btn-icon-close" (click)="cancel.emit()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          @if (subtitle()) {
            <p class="modal-subtitle">{{ subtitle() }}</p>
          }

          <div class="input-wrapper">
            <input
              type="text"
              [placeholder]="placeholder()"
              [ngModel]="inputValue()"
              (ngModelChange)="inputValue.set($event)"
              (keydown.enter)="onSubmit()"
              (keydown.escape)="cancel.emit()"
              class="prompt-input"
              autofocus
            />
          </div>

          <div class="modal-actions">
            <button (click)="cancel.emit()" class="btn-cancel">Cancel</button>
            <button
              (click)="onSubmit()"
              [disabled]="!inputValue().trim()"
              class="btn-submit"
            >
              {{ confirmLabel() }}
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

    .modal-prompt {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 20px;
      padding: 1.75rem;
      width: 90%;
      max-width: 460px;
      color: #f8fafc;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(56, 189, 248, 0.2);
      display: flex;
      flex-direction: column;
      gap: 1rem;
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
      margin: 0;
      font-size: 0.88rem;
      color: #94a3b8;
    }

    .input-wrapper {
      .prompt-input {
        width: 100%;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #f8fafc;
        border-radius: 10px;
        padding: 0.75rem 1rem;
        font-size: 0.95rem;
        outline: none;
        box-sizing: border-box;
        transition: all 0.15s ease;

        &:focus {
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }
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
export class PromptModalComponent {
  isOpen = input<boolean>(false);
  title = input<string>('Rename');
  subtitle = input<string>('');
  placeholder = input<string>('Enter name...');
  initialValue = input<string>('');
  confirmLabel = input<string>('Save');
  icon = input<string>('edit');

  submit = output<string>();
  cancel = output<void>();

  inputValue = signal<string>('');

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.inputValue.set(this.initialValue() || '');
      }
    });
  }

  onSubmit() {
    const val = this.inputValue().trim();
    if (val) {
      this.submit.emit(val);
    }
  }
}
