import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface SharedCollaborator {
  userId: string;
  userName?: string;
  accessLevel: string;
}

@Component({
  selector: 'app-share-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="close.emit()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-title">
              <mat-icon class="header-icon">{{ itemType() === 'folder' || itemType() === 'project' ? 'folder_shared' : 'share' }}</mat-icon>
              <h2>Share {{ itemType() | titlecase }}: {{ itemTitle() }}</h2>
            </div>
            <button class="btn-icon-close" (click)="close.emit()" matTooltip="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="share-code-section">
            <p>Share this 10-character code with collaborators to invite them:</p>
            <div class="share-code-display">
              <input type="text" [value]="shareCode() || 'No code yet'" readonly class="share-code-input" />
              <button (click)="copyCode.emit()" class="btn-copy">
                <mat-icon>content_copy</mat-icon> Copy Code
              </button>
            </div>

            <div class="default-access-level">
              <label for="defaultAccessLevel"><strong>Default Access Permission:</strong></label>
              <select
                id="defaultAccessLevel"
                [ngModel]="defaultAccessLevel()"
                (ngModelChange)="changeDefaultAccess($event)"
                class="access-select"
              >
                <option value="View">View Only (Read Only)</option>
                <option value="Edit">Can Edit (Read & Write)</option>
              </select>
              <p class="access-hint">
                @if (defaultAccessLevel() === 'View') {
                  <span>📖 Anyone joining via code will have <strong>view-only</strong> access.</span>
                } @else {
                  <span>✏️ Anyone joining via code will be able to <strong>view and edit</strong>.</span>
                }
              </p>
            </div>

            <button (click)="regenerateCode.emit()" class="btn-regenerate">
              <mat-icon>refresh</mat-icon> Generate New Code
            </button>
          </div>

          @if (sharedWith().length > 0) {
            <div class="shared-users">
              <h3>Collaborators ({{ sharedWith().length }}):</h3>
              <div class="user-list">
                @for (user of sharedWith(); track user.userId) {
                  <div class="user-item">
                    <div class="user-info">
                      <div class="user-avatar">{{ (user.userName || 'User').slice(0, 2).toUpperCase() }}</div>
                      <span class="user-name">{{ user.userName || 'Collaborator' }}</span>
                      @if (editingUserId() === user.userId) {
                        <select
                          [(ngModel)]="user.accessLevel"
                          class="access-select-inline"
                          (change)="onUserAccessChange(user.userId, user.accessLevel)"
                        >
                          <option value="View">View Only</option>
                          <option value="Edit">Can Edit</option>
                        </select>
                      } @else {
                        <span class="access-badge" [class.edit-access]="user.accessLevel === 'Edit'">
                          {{ user.accessLevel === 'Edit' ? '✏️ Can Edit' : '📖 View Only' }}
                        </span>
                        <button (click)="editingUserId.set(user.userId)" class="btn-change-access">
                          Change
                        </button>
                      }
                    </div>
                    <button (click)="removeUser.emit(user.userId)" class="btn-remove" matTooltip="Revoke Access">
                      <mat-icon>person_remove</mat-icon> Remove
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <div class="modal-footer">
            <button (click)="close.emit()" class="btn-close">Done</button>
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

    .modal {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 20px;
      padding: 2rem;
      width: 90%;
      max-width: 560px;
      max-height: 90vh;
      overflow-y: auto;
      color: #f8fafc;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(56, 189, 248, 0.2);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .header-title {
        display: flex;
        align-items: center;
        gap: 10px;

        .header-icon {
          color: #38bdf8;
          font-size: 26px;
          width: 26px;
          height: 26px;
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
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
        border-radius: 8px;
        padding: 4px;
        transition: all 0.15s ease;

        &:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.1);
        }
      }
    }

    .share-code-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background: rgba(15, 23, 42, 0.65);
      padding: 1.25rem;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);

      p {
        margin: 0;
        font-size: 0.88rem;
        color: #94a3b8;
      }

      .share-code-display {
        display: flex;
        gap: 10px;
        align-items: center;

        .share-code-input {
          flex: 1;
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 10px;
          padding: 0.7rem 1rem;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: #38bdf8;
          text-align: center;
          outline: none;
        }

        .btn-copy {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0.7rem 1.1rem;
          background: #0284c7;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }

          &:hover {
            background: #0369a1;
            transform: translateY(-1px);
          }
        }
      }

      .default-access-level {
        display: flex;
        flex-direction: column;
        gap: 6px;

        label {
          font-size: 0.85rem;
          color: #cbd5e1;
        }

        .access-select {
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #f8fafc;
          border-radius: 8px;
          padding: 0.55rem 0.8rem;
          font-size: 0.88rem;
          outline: none;
          cursor: pointer;

          option {
            background: #1e293b;
            color: #f8fafc;
          }
        }

        .access-hint {
          margin: 0;
          font-size: 0.8rem;
          color: #94a3b8;
        }
      }

      .btn-regenerate {
        display: flex;
        align-items: center;
        gap: 6px;
        align-self: flex-start;
        padding: 0.5rem 0.9rem;
        background: rgba(255, 255, 255, 0.07);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all 0.15s ease;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }

        &:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f8fafc;
        }
      }
    }

    .shared-users {
      display: flex;
      flex-direction: column;
      gap: 10px;

      h3 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: #e2e8f0;
      }

      .user-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 180px;
        overflow-y: auto;
      }

      .user-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(15, 23, 42, 0.5);
        padding: 0.6rem 0.85rem;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.06);

        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;

          .user-avatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #0284c7;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 700;
          }

          .user-name {
            font-size: 0.9rem;
            font-weight: 500;
            color: #f8fafc;
          }

          .access-badge {
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            background: rgba(148, 163, 184, 0.15);
            color: #94a3b8;

            &.edit-access {
              background: rgba(34, 197, 94, 0.15);
              color: #4ade80;
            }
          }

          .btn-change-access {
            background: none;
            border: none;
            color: #38bdf8;
            font-size: 0.78rem;
            cursor: pointer;
            text-decoration: underline;
            padding: 0;

            &:hover {
              color: #7dd3fc;
            }
          }

          .access-select-inline {
            background: #0f172a;
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: #f8fafc;
            border-radius: 6px;
            padding: 3px 6px;
            font-size: 0.8rem;
          }
        }

        .btn-remove {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.78rem;
          cursor: pointer;
          transition: all 0.15s ease;

          mat-icon {
            font-size: 15px;
            width: 15px;
            height: 15px;
          }

          &:hover {
            background: rgba(239, 68, 68, 0.3);
            color: #fca5a5;
          }
        }
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.5rem;

      .btn-close {
        padding: 0.65rem 1.5rem;
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: rgba(255, 255, 255, 0.18);
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
export class ShareModalComponent {
  isOpen = input<boolean>(false);
  itemType = input<'document' | 'folder' | 'project'>('document');
  itemTitle = input<string>('');
  shareCode = input<string | null>('');
  defaultAccessLevel = input<string>('View');
  sharedWith = input<SharedCollaborator[]>([]);

  close = output<void>();
  copyCode = output<void>();
  regenerateCode = output<void>();
  updateDefaultAccess = output<string>();
  updateUserAccess = output<{ userId: string; accessLevel: string }>();
  removeUser = output<string>();

  editingUserId = signal<string | null>(null);

  changeDefaultAccess(level: string) {
    this.updateDefaultAccess.emit(level);
  }

  onUserAccessChange(userId: string, level: string) {
    this.editingUserId.set(null);
    this.updateUserAccess.emit({ userId, accessLevel: level });
  }
}
