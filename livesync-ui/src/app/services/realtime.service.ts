import { Injectable, signal, computed, DestroyRef, inject, WritableSignal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';
import { appEndpoints } from '../app-endpoints';

export interface CollaboratorCursor {
  userId: string;
  position: number;
  color: string;
  lineNumber?: number;
  scrollLine?: number;
  userName?: string;
  documentId?: string;
}

export interface CodeCommentReply {
  id: string;
  commentId: string;
  text: string;
  authorName: string;
  createdAt: string;
}

export interface CodeComment {
  id: string;
  documentId: string;
  lineNumber: number;
  text: string;
  authorName: string;
  createdAt: string;
  resolved: boolean;
  replies: CodeCommentReply[];
}

export interface DocumentRealtimeState {
  documentId: string;
  subscribers: number;
  contentUpdate: WritableSignal<string>;
  activeUserCount: WritableSignal<number>;
  userJoined: WritableSignal<string>;
  userLeft: WritableSignal<string>;
  cursorUpdate: WritableSignal<CollaboratorCursor | null>;
  activeCollaborators: WritableSignal<CollaboratorCursor[]>;
  comments: WritableSignal<CodeComment[]>;
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private socket!: Socket;
  private isStarting = false;

  readonly connectionState = signal<string>('disconnected');
  readonly currentDocumentId = signal<string | null>(null);
  readonly followedUserId = signal<string | null>(null);

  private readonly documentStates = new Map<string, DocumentRealtimeState>();

  // Computed signals backing active document for backward compatibility with component templates
  readonly contentUpdate = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.contentUpdate() ?? '') : '';
  });

  readonly userJoined = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.userJoined() ?? '') : '';
  });

  readonly userLeft = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.userLeft() ?? '') : '';
  });

  readonly activeUserCount = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.activeUserCount() ?? 0) : 0;
  });

  readonly cursorUpdate = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.cursorUpdate() ?? null) : null;
  });

  readonly activeCollaborators = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.activeCollaborators() ?? []) : [];
  });

  readonly comments = computed(() => {
    const docId = this.currentDocumentId();
    return docId ? (this.documentStates.get(docId)?.comments() ?? []) : [];
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.disconnect();
    });

    const serverUrl = appEndpoints.realtimeBaseUrl || window.location.origin;
    this.socket = io(serverUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: {
        token: this.authService.token() || '',
      },
    });

    this.socket.on('connect', () => {
      this.connectionState.set('connected');
      console.log('Realtime Multiplexed Socket Connected successfully:', this.socket.id);
      for (const [docId] of this.documentStates) {
        this.socket.emit('JoinDocument', docId);
      }
    });

    this.socket.on('disconnect', () => {
      this.connectionState.set('disconnected');
      console.log('Realtime Socket Disconnected');
    });

    this.socket.on('connect_error', (err) => {
      this.connectionState.set('error');
      console.error('Realtime Socket Connection error:', err);
    });

    // Wire multiplexed incoming event listeners
    this.socket.on('ReceiveContentUpdate', (arg1: any, arg2?: any) => {
      let docId = this.currentDocumentId();
      let content = '';

      if (typeof arg1 === 'object' && arg1 !== null) {
        docId = arg1.documentId || arg1.fileId || docId;
        content = arg1.content ?? '';
      } else {
        content = typeof arg1 === 'string' ? arg1 : (arg2 ?? '');
      }

      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.contentUpdate.set(content);
      }
    });

    this.socket.on('UserJoined', (arg1: any, arg2?: any, arg3?: any) => {
      let connId = '';
      let count = 0;
      let docId = this.currentDocumentId();

      if (typeof arg1 === 'object' && arg1 !== null) {
        docId = arg1.documentId || docId;
        connId = arg1.connectionId || '';
        count = arg1.count ?? 0;
      } else {
        connId = String(arg1 || '');
        count = Number(arg2 || 0);
        if (arg3 && typeof arg3 === 'string') docId = arg3;
      }

      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.userJoined.set(connId);
        state.activeUserCount.set(count);
      }
    });

    this.socket.on('UserLeft', (arg1: any, arg2?: any, arg3?: any) => {
      let connId = '';
      let count = 0;
      let docId = this.currentDocumentId();

      if (typeof arg1 === 'object' && arg1 !== null) {
        docId = arg1.documentId || docId;
        connId = arg1.connectionId || '';
        count = arg1.count ?? 0;
      } else {
        connId = String(arg1 || '');
        count = Number(arg2 || 0);
        if (arg3 && typeof arg3 === 'string') docId = arg3;
      }

      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.userLeft.set(connId);
        state.activeUserCount.set(count);
        state.activeCollaborators.update((prev) => prev.filter((c) => c.userId !== connId));
      }

      if (this.followedUserId() === connId) {
        this.unfollowUser();
      }
    });

    this.socket.on('ReceiveCursorUpdate', (arg1: any, arg2?: any, arg3?: any) => {
      let data: CollaboratorCursor;
      let docId = this.currentDocumentId();

      if (typeof arg1 === 'object' && arg1 !== null) {
        data = arg1;
        docId = arg1.documentId || docId;
      } else {
        data = {
          userId: arg1,
          position: arg2,
          color: arg3 || '#2196F3',
          lineNumber: 1,
          scrollLine: 1,
        };
      }

      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.cursorUpdate.set(data);
        state.activeCollaborators.update((prev) => {
          const existingIdx = prev.findIndex((c) => c.userId === data.userId);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = { ...updated[existingIdx], ...data };
            return updated;
          }
          return [...prev, data];
        });
      }
    });

    // Threaded Comment listeners
    this.socket.on('ReceiveComment', (comment: CodeComment) => {
      const docId = comment.documentId || this.currentDocumentId();
      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.comments.update((prev) => [...prev, comment]);
      }
    });

    this.socket.on('ReceiveCommentReply', (reply: CodeCommentReply & { documentId?: string }) => {
      const docId = reply.documentId || this.currentDocumentId();
      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.comments.update((prev) =>
          prev.map((c) => (c.id === reply.commentId ? { ...c, replies: [...c.replies, reply] } : c)),
        );
      }
    });

    this.socket.on('ReceiveCommentResolved', (data: { documentId?: string; commentId: string; resolved: boolean }) => {
      const docId = data.documentId || this.currentDocumentId();
      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.comments.update((prev) =>
          prev.map((c) => (c.id === data.commentId ? { ...c, resolved: data.resolved } : c)),
        );
      }
    });

    this.socket.on('ReceiveCommentDeleted', (data: { documentId?: string; commentId: string }) => {
      const docId = data.documentId || this.currentDocumentId();
      if (docId) {
        const state = this.getOrCreateDocumentState(docId);
        state.comments.update((prev) => prev.filter((c) => c.id !== data.commentId));
      }
    });
  }

  getOrCreateDocumentState(docId: string): DocumentRealtimeState {
    let state = this.documentStates.get(docId);
    if (!state) {
      state = {
        documentId: docId,
        subscribers: 0,
        contentUpdate: signal<string>(''),
        activeUserCount: signal<number>(0),
        userJoined: signal<string>(''),
        userLeft: signal<string>(''),
        cursorUpdate: signal<CollaboratorCursor | null>(null),
        activeCollaborators: signal<CollaboratorCursor[]>([]),
        comments: signal<CodeComment[]>([]),
      };
      this.documentStates.set(docId, state);
    }
    return state;
  }

  setCurrentDocumentId(docId: string | null): void {
    this.currentDocumentId.set(docId);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.connectionState.set('disconnected');
      this.documentStates.clear();
      this.currentDocumentId.set(null);
    }
  }

  async startConnection(): Promise<void> {
    if (this.socket.connected) {
      this.connectionState.set('connected');
      return;
    }

    if (this.isStarting) return;
    this.isStarting = true;

    try {
      const token = this.authService.token() || '';
      this.socket.auth = { token };

      this.socket.connect();
    } catch (err) {
      this.connectionState.set('error');
      console.error('Error starting Realtime Socket connection:', err);
      throw err;
    } finally {
      this.isStarting = false;
    }
  }

  async joinDocument(docId: string): Promise<void> {
    if (!docId) return;

    this.setCurrentDocumentId(docId);
    const state = this.getOrCreateDocumentState(docId);
    state.subscribers++;

    await this.startConnection();

    this.socket.emit('JoinDocument', docId);
  }

  async leaveDocument(docId: string): Promise<void> {
    if (!docId) return;

    const state = this.documentStates.get(docId);
    if (state) {
      state.subscribers--;
      if (state.subscribers <= 0) {
        if (this.socket && this.socket.connected) {
          this.socket.emit('LeaveDocument', docId);
        }
        this.documentStates.delete(docId);
      }
    }

    if (this.currentDocumentId() === docId) {
      const remainingDocs = Array.from(this.documentStates.keys());
      this.currentDocumentId.set(remainingDocs.length > 0 ? remainingDocs[remainingDocs.length - 1] : null);
    }
  }

  sendUpdate(docId: string, content: string): Promise<void> {
    this.socket.emit('SendContentUpdate', { documentId: docId, fileId: docId, content });
    return Promise.resolve();
  }

  sendCursorPosition(
    docId: string,
    position: number,
    lineNumber: number = 1,
    scrollLine: number = 1,
    userName: string = 'Collaborator',
  ): Promise<void> {
    this.socket.emit('SendCursorPosition', {
      documentId: docId,
      fileId: docId,
      position,
      lineNumber,
      scrollLine,
      userName,
    });
    return Promise.resolve();
  }

  // Follow Mode controls
  followUser(userId: string) {
    this.followedUserId.set(userId);
  }

  unfollowUser() {
    this.followedUserId.set(null);
  }

  // Inline Comment controls
  addComment(docId: string, lineNumber: number, text: string, authorName: string) {
    const newComment: CodeComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      documentId: docId,
      lineNumber,
      text,
      authorName,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      resolved: false,
      replies: [],
    };
    const state = this.getOrCreateDocumentState(docId);
    state.comments.update((prev) => [...prev, newComment]);
    this.socket.emit('AddComment', newComment);
  }

  addCommentReply(docId: string, commentId: string, text: string, authorName: string) {
    const reply: CodeCommentReply = {
      id: `rpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      commentId,
      text,
      authorName,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const state = this.getOrCreateDocumentState(docId);
    state.comments.update((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c)),
    );
    this.socket.emit('AddCommentReply', { documentId: docId, fileId: docId, ...reply });
  }

  resolveComment(docId: string, commentId: string) {
    const state = this.getOrCreateDocumentState(docId);
    state.comments.update((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
    );
    this.socket.emit('ResolveComment', { documentId: docId, fileId: docId, commentId, resolved: true });
  }

  deleteComment(docId: string, commentId: string) {
    const state = this.getOrCreateDocumentState(docId);
    state.comments.update((prev) => prev.filter((c) => c.id !== commentId));
    this.socket.emit('DeleteComment', { documentId: docId, fileId: docId, commentId });
  }
}
