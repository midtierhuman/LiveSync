import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-confirm-delete-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="cancel.emit()">
        <div class="modal-small" (click)="$event.stopPropagation()">
          <div class="delete-icon-wrapper">
            <mat-icon class="delete-icon">delete_forever</mat-icon>
          </div>
          <h2>Delete {{ itemType() | titlecase }}?</h2>
          <p class="item-name">"<strong>{{ itemName() }}</strong>"</p>
          <p class="warning-text">
            {{ warningText() || 'This action is irreversible and will remove all contents and collaborator access.' }}
          </p>
          <div class="modal-actions">
            <button (click)="cancel.emit()" class="btn-cancel">Cancel</button>
            <button (click)="confirm.emit()" class="btn-delete">
              <mat-icon>delete</mat-icon> Delete
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

    .modal-small {
      background: #1e293b;
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 20px;
      padding: 2rem;
      width: 90%;
      max-width: 440px;
      color: #f8fafc;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(239, 68, 68, 0.2);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.85rem;
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .delete-icon-wrapper {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(239, 68, 68, 0.3);

      .delete-icon {
        color: #ef4444;
        font-size: 28px;
        width: 28px;
        height: 28px;
      }
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .item-name {
      margin: 0;
      font-size: 0.95rem;
      color: #cbd5e1;
      word-break: break-word;
    }

    .warning-text {
      margin: 0;
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.4;
    }

    .modal-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 0.75rem;
      width: 100%;

      .btn-cancel {
        flex: 1;
        padding: 0.65rem 1rem;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.88rem;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #f8fafc;
        }
      }

      .btn-delete {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0.65rem 1rem;
        background: #dc2626;
        border: 1px solid #ef4444;
        color: #ffffff;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.88rem;
        cursor: pointer;
        transition: all 0.15s ease;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }

        &:hover {
          background: #b91c1c;
          transform: translateY(-1px);
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
export class ConfirmDeleteModalComponent {
  isOpen = input<boolean>(false);
  itemType = input<'document' | 'folder' | 'project' | 'file'>('document');
  itemName = input<string>('');
  warningText = input<string>('');

  confirm = output<void>();
  cancel = output<void>();
}
