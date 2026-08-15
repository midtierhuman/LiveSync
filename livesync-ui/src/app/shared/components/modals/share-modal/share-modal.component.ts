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
        <div class="modal-compact" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div class="header-left">
              <mat-icon class="header-icon">{{ itemType() === 'folder' || itemType() === 'project' ? 'folder_shared' : 'share' }}</mat-icon>
              <h3>Share {{ itemType() | titlecase }}: <span class="item-name">{{ itemTitle() }}</span></h3>
            </div>
            <button class="btn-close" (click)="close.emit()" matTooltip="Close">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="modal-body">
            <div class="share-code-box">
              <span class="box-label">Invite Share Code</span>
              <div class="share-code-row">
                <input type="text" [value]="shareCode() || 'No code generated'" readonly class="share-code-input" />
                <button (click)="copyCode.emit()" class="btn-action-primary">
                  <mat-icon>content_copy</mat-icon>
                  <span>Copy</span>
                </button>
                <button (click)="regenerateCode.emit()" class="btn-action-secondary" matTooltip="Generate New Code">
                  <mat-icon>refresh</mat-icon>
                </button>
              </div>

              <div class="permission-row">
                <label for="defaultAccessLevel">Default Access:</label>
                <select
                  id="defaultAccessLevel"
                  [ngModel]="defaultAccessLevel()"
                  (ngModelChange)="changeDefaultAccess($event)"
                  class="access-select"
                >
                  <option value="View">View Only (Read)</option>
                  <option value="Edit">Can Edit (Read/Write)</option>
                </select>
              </div>
            </div>

            @if (sharedWith().length > 0) {
              <div class="collaborators-section">
                <div class="section-title">Active Collaborators ({{ sharedWith().length }})</div>
                <div class="user-list">
                  @for (user of sharedWith(); track user.userId) {
                    <div class="user-item">
                      <div class="user-info">
                        <div class="user-avatar">{{ (user.userName || 'U').slice(0, 2).toUpperCase() }}</div>
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
                            {{ user.accessLevel === 'Edit' ? 'Edit' : 'View' }}
                          </span>
                          <button (click)="editingUserId.set(user.userId)" class="btn-text-action">
                            Change
                          </button>
                        }
                      </div>
                      <button (click)="removeUser.emit(user.userId)" class="btn-remove" matTooltip="Revoke Access">
                        <mat-icon>person_remove</mat-icon>
                      </button>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <div class="modal-footer">
            <button (click)="close.emit()" class="btn-primary">Done</button>
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
      max-width: 440px;
      max-height: 85vh;
      overflow-y: auto;
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
        min-width: 0;

        .header-icon {
          color: #38bdf8;
          font-size: 16px;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #f0f6fc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;

          .item-name {
            color: #38bdf8;
          }
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
      gap: 12px;

      .share-code-box {
        background: #0f1117;
        border: 1px solid #272d3d;
        border-radius: 4px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;

        .box-label {
          font-size: 11px;
          font-weight: 600;
          color: #8b949e;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .share-code-row {
          display: flex;
          align-items: center;
          gap: 6px;

          .share-code-input {
            flex: 1;
            background: #161922;
            border: 1px solid #272d3d;
            border-radius: 4px;
            padding: 5px 8px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12.5px;
            font-weight: 600;
            color: #38bdf8;
            letter-spacing: 1px;
            outline: none;
          }

          .btn-action-primary {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 8px;
            background: #0284c7;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            border-radius: 4px;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;

            &:hover {
              background: #0369a1;
            }

            mat-icon {
              font-size: 13px;
              width: 13px;
              height: 13px;
            }
          }

          .btn-action-secondary {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 5px;
            background: #1c212c;
            border: 1px solid #272d3d;
            color: #8b949e;
            border-radius: 4px;
            cursor: pointer;

            &:hover {
              background: #232836;
              color: #f0f6fc;
            }

            mat-icon {
              font-size: 14px;
              width: 14px;
              height: 14px;
            }
          }
        }

        .permission-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11.5px;
          color: #8b949e;

          .access-select {
            background: #161922;
            border: 1px solid #272d3d;
            color: #f0f6fc;
            border-radius: 4px;
            padding: 3px 6px;
            font-size: 11.5px;
            outline: none;
            cursor: pointer;

            option {
              background: #161922;
            }
          }
        }
      }

      .collaborators-section {
        display: flex;
        flex-direction: column;
        gap: 6px;

        .section-title {
          font-size: 11.5px;
          font-weight: 600;
          color: #8b949e;
        }

        .user-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 150px;
          overflow-y: auto;
        }

        .user-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #0f1117;
          border: 1px solid #232836;
          border-radius: 4px;
          padding: 5px 8px;

          .user-info {
            display: flex;
            align-items: center;
            gap: 6px;

            .user-avatar {
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: #0284c7;
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 9px;
              font-weight: 700;
            }

            .user-name {
              font-size: 11.5px;
              color: #f0f6fc;
            }

            .access-badge {
              padding: 1px 5px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 600;
              background: rgba(148, 163, 184, 0.12);
              color: #8b949e;

              &.edit-access {
                background: rgba(34, 197, 94, 0.12);
                color: #4ade80;
              }
            }

            .btn-text-action {
              background: none;
              border: none;
              color: #38bdf8;
              font-size: 10.5px;
              cursor: pointer;
              padding: 0;
              text-decoration: underline;

              &:hover {
                color: #7dd3fc;
              }
            }

            .access-select-inline {
              background: #161922;
              border: 1px solid #272d3d;
              color: #f0f6fc;
              border-radius: 3px;
              padding: 2px 4px;
              font-size: 11px;
            }
          }

          .btn-remove {
            background: transparent;
            border: none;
            color: #8b949e;
            cursor: pointer;
            padding: 2px;
            display: flex;
            align-items: center;

            &:hover {
              color: #ef4444;
            }

            mat-icon {
              font-size: 13px;
              width: 13px;
              height: 13px;
            }
          }
        }
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      padding: 10px 14px;
      background: #12141c;
      border-top: 1px solid #232836;
      border-radius: 0 0 6px 6px;

      .btn-primary {
        padding: 4px 12px;
        background: #0284c7;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #fff;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;

        &:hover {
          background: #0369a1;
        }
      }
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
