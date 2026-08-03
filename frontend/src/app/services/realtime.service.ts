import { Injectable, signal, DestroyRef, inject } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private socket!: Socket;
  private isStarting = false;

  // Signals for reactive state
  readonly contentUpdate = signal<string>('');
  readonly connectionState = signal<string>('disconnected');
  readonly userJoined = signal<string>('');
  readonly userLeft = signal<string>('');
  readonly activeUserCount = signal<number>(0);

  // Extended Presence & Follow Mode
  readonly cursorUpdate = signal<CollaboratorCursor | null>(null);
  readonly activeCollaborators = signal<CollaboratorCursor[]>([]);
  readonly followedUserId = signal<string | null>(null);

  // Inline Threaded Comments State
  readonly comments = signal<CodeComment[]>([]);

  private currentDocumentId: string | null = null;
  private isJoined = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.currentDocumentId) {
        this.leaveDocument(this.currentDocumentId);
      }
      if (this.socket) {
        this.socket.disconnect();
      }
    });

    const serverUrl = appEndpoints.realtimeBaseUrl || appEndpoints.signalRBaseUrl || 'http://localhost:5038';
    this.socket = io(serverUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      query: {
        access_token: this.authService.token() || '',
      },
    });

    this.socket.on('connect', () => {
      this.connectionState.set('connected');
      console.log('Realtime Socket Connected successfully:', this.socket.id);
      if (this.currentDocumentId) {
        this.socket.emit('JoinDocument', this.currentDocumentId);
        this.isJoined = true;
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

    // Wire listeners
    this.socket.on('ReceiveContentUpdate', (content: string) => {
      this.contentUpdate.set(content);
    });

    this.socket.on('UserJoined', (connectionId: string, count: number) => {
      this.userJoined.set(connectionId);
      this.activeUserCount.set(count);
    });

    this.socket.on('UserLeft', (connectionId: string, count: number) => {
      this.userLeft.set(connectionId);
      this.activeUserCount.set(count);
      this.activeCollaborators.update((prev) => prev.filter((c) => c.userId !== connectionId));
      if (this.followedUserId() === connectionId) {
        this.unfollowUser();
      }
    });

    this.socket.on('ReceiveCursorUpdate', (arg1: any, arg2?: any, arg3?: any) => {
      let data: CollaboratorCursor;
      if (typeof arg1 === 'object' && arg1 !== null) {
        data = arg1;
      } else {
        data = {
          userId: arg1,
          position: arg2,
          color: arg3 || '#2196F3',
          lineNumber: 1,
          scrollLine: 1,
        };
      }
      this.cursorUpdate.set(data);

      this.activeCollaborators.update((prev) => {
        const existingIdx = prev.findIndex((c) => c.userId === data.userId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...data };
          return updated;
        }
        return [...prev, data];
      });
    });

    // Threaded Comment listeners
    this.socket.on('ReceiveComment', (comment: CodeComment) => {
      this.comments.update((prev) => [...prev, comment]);
    });

    this.socket.on('ReceiveCommentReply', (reply: CodeCommentReply) => {
      this.comments.update((prev) =>
        prev.map((c) => (c.id === reply.commentId ? { ...c, replies: [...c.replies, reply] } : c)),
      );
    });

    this.socket.on('ReceiveCommentResolved', (data: { commentId: string; resolved: boolean }) => {
      this.comments.update((prev) =>
        prev.map((c) => (c.id === data.commentId ? { ...c, resolved: data.resolved } : c)),
      );
    });

    this.socket.on('ReceiveCommentDeleted', (data: { commentId: string }) => {
      this.comments.update((prev) => prev.filter((c) => c.id !== data.commentId));
    });
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
      (this.socket as any).io.opts.query = { access_token: token };

      this.socket.connect();
      this.isStarting = false;
    } catch (err) {
      this.connectionState.set('error');
      this.isStarting = false;
      console.error('Error starting Realtime Socket connection:', err);
      throw err;
    }
  }

  async joinDocument(docId: string): Promise<void> {
    if (this.currentDocumentId === docId && this.isJoined) {
      return;
    }

    if (this.currentDocumentId && this.isJoined && this.currentDocumentId !== docId) {
      await this.leaveDocument(this.currentDocumentId);
    }

    this.socket.emit('JoinDocument', docId);
    this.currentDocumentId = docId;
    this.isJoined = true;
    this.comments.set([]);
  }

  async leaveDocument(docId: string): Promise<void> {
    if (!this.isJoined || this.currentDocumentId !== docId) {
      return;
    }

    this.socket.emit('LeaveDocument', docId);
    this.currentDocumentId = null;
    this.isJoined = false;
    this.activeUserCount.set(0);
    this.activeCollaborators.set([]);
    this.unfollowUser();
  }

  sendUpdate(docId: string, content: string): Promise<void> {
    this.socket.emit('SendContentUpdate', docId, content);
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
    this.comments.update((prev) => [...prev, newComment]);
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

    this.comments.update((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c)),
    );
    this.socket.emit('AddCommentReply', { documentId: docId, ...reply });
  }

  resolveComment(docId: string, commentId: string) {
    this.comments.update((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
    );
    this.socket.emit('ResolveComment', { documentId: docId, commentId, resolved: true });
  }

  deleteComment(docId: string, commentId: string) {
    this.comments.update((prev) => prev.filter((c) => c.id !== commentId));
    this.socket.emit('DeleteComment', { documentId: docId, commentId });
  }
}
