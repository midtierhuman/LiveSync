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
        <div class="modal-compact" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-left">
              <mat-icon class="icon-danger">warning</mat-icon>
              <h3>Delete {{ itemType() | titlecase }}</h3>
            </div>
            <button class="btn-close" (click)="cancel.emit()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="modal-body">
            <p class="desc">Are you sure you want to permanently delete <code class="item-name">{{ itemName() }}</code>?</p>
            <p class="sub-desc">
              {{ warningText() || 'This action is irreversible and will delete all enclosed files and collaborator links.' }}
            </p>
          </div>

          <div class="modal-footer">
            <button (click)="cancel.emit()" class="btn-ghost">Cancel</button>
            <button (click)="confirm.emit()" class="btn-danger">
              <mat-icon>delete</mat-icon>
              <span>Delete</span>
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

        .icon-danger {
          color: #ef4444;
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
      gap: 6px;

      .desc {
        margin: 0;
        font-size: 12.5px;
        color: #c9d1d9;
        line-height: 1.4;

        .item-name {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: #0f1117;
          border: 1px solid #272d3d;
          padding: 1px 5px;
          border-radius: 3px;
          color: #f87171;
          font-size: 12px;
        }
      }

      .sub-desc {
        margin: 0;
        font-size: 11.5px;
        color: #8b949e;
        line-height: 1.35;
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
        display: inline-flex;
        align-items: center;
        gap: 4px;
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

        &.btn-danger {
          background: #dc2626;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ffffff;

          &:hover {
            background: #b91c1c;
          }

          mat-icon {
            font-size: 13px;
            width: 13px;
            height: 13px;
          }
        }
      }
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
