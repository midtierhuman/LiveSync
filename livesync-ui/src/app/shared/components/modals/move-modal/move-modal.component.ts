import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface FolderSelectItem {
  id: string;
  name: string;
  parentFolderId?: string | null;
}

@Component({
  selector: 'app-move-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="cancel.emit()">
        <div class="modal-move" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-title">
              <mat-icon class="header-icon">drive_file_move</mat-icon>
              <h2>Move {{ itemType() | titlecase }}: "{{ itemName() }}"</h2>
            </div>
            <button class="btn-icon-close" (click)="cancel.emit()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <p class="modal-hint">Select a destination folder:</p>

          <div class="folder-list">
            <div
              class="folder-item root-item"
              (click)="selectFolder.emit(null)"
            >
              <mat-icon class="item-icon">home</mat-icon>
              <div class="item-meta">
                <span class="item-name">Root Workspace</span>
                <span class="item-desc">Move to top-level</span>
              </div>
            </div>

            @for (f of availableFolders(); track f.id) {
              <div
                class="folder-item"
                (click)="selectFolder.emit(f.id)"
              >
                <mat-icon class="item-icon">folder</mat-icon>
                <div class="item-meta">
                  <span class="item-name">{{ f.name }}</span>
                </div>
              </div>
            }

            @if (availableFolders().length === 0) {
              <p class="no-folders-msg">No other folders available.</p>
            }
          </div>

          <div class="modal-actions">
            <button (click)="cancel.emit()" class="btn-cancel">Cancel</button>
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

    .modal-move {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 20px;
      padding: 1.75rem;
      width: 90%;
      max-width: 480px;
      max-height: 85vh;
      overflow-y: auto;
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
          word-break: break-word;
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

    .modal-hint {
      margin: 0;
      font-size: 0.88rem;
      color: #94a3b8;
    }

    .folder-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 260px;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.5);
      border-radius: 12px;
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);

      .folder-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0.7rem 0.9rem;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;

        .item-icon {
          color: #38bdf8;
          font-size: 20px;
          width: 20px;
          height: 20px;
        }

        .item-meta {
          display: flex;
          flex-direction: column;

          .item-name {
            font-size: 0.9rem;
            font-weight: 500;
            color: #f8fafc;
          }

          .item-desc {
            font-size: 0.75rem;
            color: #64748b;
          }
        }

        &:hover {
          background: rgba(56, 189, 248, 0.15);
          transform: translateX(4px);
        }

        &.root-item {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px 8px 0 0;
          .item-icon {
            color: #a855f7;
          }
        }
      }

      .no-folders-msg {
        margin: 0.5rem;
        font-size: 0.85rem;
        color: #64748b;
        text-align: center;
      }
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.25rem;

      .btn-cancel {
        padding: 0.6rem 1.25rem;
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
export class MoveModalComponent {
  isOpen = input<boolean>(false);
  itemType = input<'document' | 'folder' | 'file'>('document');
  itemName = input<string>('');
  availableFolders = input<FolderSelectItem[]>([]);

  selectFolder = output<string | null>();
  cancel = output<void>();
}
