import { Server, Socket } from 'socket.io';
import { IDocumentStateService, RedisDocumentStateService } from '../services/documentStateService';
import { DocumentAccessClient } from '../services/documentAccessClient';
import { ConflictResolver } from '../services/conflictResolver';
import { Operation } from '../models/operation';

const CURSOR_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];

export class EditorHub {
  constructor(
    private readonly io: Server,
    private readonly state: IDocumentStateService,
    private readonly documentAccessClient: DocumentAccessClient,
    private readonly conflictResolver: ConflictResolver
  ) {}

  public registerHandlers(socket: Socket): void {
    // On Connection setup
    const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
    this.state.setColor(socket.id, color).catch((err: unknown) => console.error('Error setting cursor color:', err));
    console.log(`Connection established: ${socket.id}`);

    // Handler registrations supporting PascalCase, camelCase, and pub/sub subscribe/unsubscribe frames
    const joinHandler = (arg: any) => {
      const docId = typeof arg === 'string' ? arg : (arg?.documentId || arg?.fileId || arg?.roomId || '');
      const initialContent = typeof arg === 'object' ? arg?.initialContent : undefined;
      return this.handleJoinDocument(socket, docId, initialContent);
    };
    const leaveHandler = (arg: any) => {
      const docId = typeof arg === 'string' ? arg : (arg?.documentId || arg?.fileId || arg?.roomId || '');
      return this.handleLeaveDocument(socket, docId);
    };

    socket.on('JoinDocument', joinHandler);
    socket.on('joinDocument', joinHandler);
    socket.on('subscribe', joinHandler);

    socket.on('LeaveDocument', leaveHandler);
    socket.on('leaveDocument', leaveHandler);
    socket.on('unsubscribe', leaveHandler);

    socket.on('SendContentUpdate', (arg1: any, arg2?: any) => this.handleSendContentUpdate(socket, arg1, arg2));
    socket.on('sendContentUpdate', (arg1: any, arg2?: any) => this.handleSendContentUpdate(socket, arg1, arg2));

    socket.on('SendOperation', (arg1: any, arg2?: any) => this.handleSendOperation(socket, arg1, arg2));
    socket.on('sendOperation', (arg1: any, arg2?: any) => this.handleSendOperation(socket, arg1, arg2));

    socket.on('RequestMissedOperations', (arg1: any, arg2?: any) => this.handleRequestMissedOperations(socket, arg1, arg2));
    socket.on('requestMissedOperations', (arg1: any, arg2?: any) => this.handleRequestMissedOperations(socket, arg1, arg2));

    socket.on('SendCursorPosition', (arg1: any, arg2?: any) => this.handleSendCursorPosition(socket, arg1, arg2));
    socket.on('sendCursorPosition', (arg1: any, arg2?: any) => this.handleSendCursorPosition(socket, arg1, arg2));

    // Inline Threaded Comments events
    socket.on('AddComment', (data: any) => this.handleCommentEvent(socket, 'ReceiveComment', data));
    socket.on('addComment', (data: any) => this.handleCommentEvent(socket, 'ReceiveComment', data));

    socket.on('AddCommentReply', (data: any) => this.handleCommentEvent(socket, 'ReceiveCommentReply', data));
    socket.on('addCommentReply', (data: any) => this.handleCommentEvent(socket, 'ReceiveCommentReply', data));

    socket.on('ResolveComment', (data: any) => this.handleCommentEvent(socket, 'ReceiveCommentResolved', data));
    socket.on('resolveComment', (data: any) => this.handleCommentEvent(socket, 'ReceiveCommentResolved', data));

    socket.on('DeleteComment', (data: any) => this.handleCommentEvent(socket, 'ReceiveCommentDeleted', data));
    socket.on('deleteComment', (data: any) => this.handleCommentEvent(socket, 'ReceiveCommentDeleted', data));

    // Workspace Room & Tree Metadata Sync events (BUG-03)
    const joinWorkspaceHandler = (arg: any) => {
      const workspaceId = typeof arg === 'string' ? arg : (arg?.workspaceId || arg?.folderId || arg?.projectId || '');
      return this.handleJoinWorkspace(socket, workspaceId);
    };
    const leaveWorkspaceHandler = (arg: any) => {
      const workspaceId = typeof arg === 'string' ? arg : (arg?.workspaceId || arg?.folderId || arg?.projectId || '');
      return this.handleLeaveWorkspace(socket, workspaceId);
    };

    socket.on('JoinWorkspace', joinWorkspaceHandler);
    socket.on('joinWorkspace', joinWorkspaceHandler);
    socket.on('LeaveWorkspace', leaveWorkspaceHandler);
    socket.on('leaveWorkspace', leaveWorkspaceHandler);

    socket.on('WorkspaceChange', (data: any) => this.handleWorkspaceChange(socket, data));
    socket.on('workspaceChange', (data: any) => this.handleWorkspaceChange(socket, data));

    // User-Level Socket Channel Multiplexing (ARCH-06)
    const joinUserHandler = (arg: any) => {
      const userId = typeof arg === 'string' ? arg : arg?.userId;
      this.handleJoinUser(socket, userId);
    };
    socket.on('JoinUser', joinUserHandler);
    socket.on('joinUser', joinUserHandler);

    // Real-Time Collaborator Permission Updates (FEAT-16 / ARCH-06)
    socket.on('UpdateCollaboratorPermission', (data: any) => this.handleUpdateCollaboratorPermission(socket, data));
    socket.on('updateCollaboratorPermission', (data: any) => this.handleUpdateCollaboratorPermission(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private readonly documentTokens = new Map<string, Map<string, string>>();
  private readonly lastEditorByDocument = new Map<string, string>();
  private readonly lastSavedContent = new Map<string, string>();
  private sweeperTimer: NodeJS.Timeout | null = null;
  private flusherTimer: NodeJS.Timeout | null = null;

  /**
   * Starts a periodic sweep that removes stale connection IDs from Redis.
   * Call this once after constructing the hub.
   */
  public startStaleConnectionSweeper(intervalMs: number = 120000): void {
    if (this.sweeperTimer) return;
    this.sweeperTimer = setInterval(() => {
      this.sweepStaleConnections().catch((err: unknown) =>
        console.error('Stale connection sweep error:', err)
      );
    }, intervalMs);
    console.log(`Stale connection sweeper started (every ${intervalMs / 1000}s)`);
  }

  public stopStaleConnectionSweeper(): void {
    if (this.sweeperTimer) {
      clearInterval(this.sweeperTimer);
      this.sweeperTimer = null;
      console.log('Stale connection sweeper stopped.');
    }
  }

  /**
   * Starts a periodic Write-Back flusher that dumps active Redis document content to PostgreSQL.
   */
  public startPeriodicPostgresFlusher(intervalMs: number = 60000): void {
    if (this.flusherTimer) return;
    this.flusherTimer = setInterval(() => {
      this.flushActiveDocumentsToPostgres().catch((err: unknown) =>
        console.error('Periodic PostgreSQL flush error:', err)
      );
    }, intervalMs);
    console.log(`Periodic PostgreSQL Write-Back Flusher started (every ${intervalMs / 1000}s)`);
  }

  public stopPeriodicPostgresFlusher(): void {
    if (this.flusherTimer) {
      clearInterval(this.flusherTimer);
      this.flusherTimer = null;
      console.log('Periodic PostgreSQL Write-Back Flusher stopped.');
    }
  }

  private async flushActiveDocumentsToPostgres(): Promise<void> {
    if (!(this.state instanceof RedisDocumentStateService)) return;

    const concreteState = this.state as RedisDocumentStateService;
    const documentIds = await concreteState.getAllDocumentUserKeys();

    for (const documentId of documentIds) {
      const activeContent = await concreteState.getContent(documentId);
      const accessToken = this.getTokenForDocumentSave(documentId);

      if (activeContent !== null) {
        const lastSaved = this.lastSavedContent.get(documentId);
        if (activeContent !== lastSaved) {
          await concreteState.publishSaveEvent(documentId, activeContent);
          if (accessToken) {
            const success = await this.documentAccessClient.saveDocumentContent(documentId, activeContent, accessToken);
            if (success) {
              this.lastSavedContent.set(documentId, activeContent);
              console.log(`[Write-Back Timer] Flushed document ${documentId} to Redis Stream & PostgreSQL`);
            }
          } else {
            this.lastSavedContent.set(documentId, activeContent);
            console.log(`[Write-Back Timer] Published save event for document ${documentId}`);
          }
        }
      }
    }
  }

  private async sweepStaleConnections(): Promise<void> {
    // Only works when state is the concrete Redis implementation
    if (!(this.state instanceof RedisDocumentStateService)) return;

    const concreteState = this.state as RedisDocumentStateService;
    const documentIds = await concreteState.getAllDocumentUserKeys();

    // Fetch socket IDs across ALL replicas via the Redis adapter
    const allSockets = await this.io.fetchSockets();
    const connectedIds = new Set<string>(allSockets.map(s => s.id));

    let swept = 0;
    for (const documentId of documentIds) {
      const members = await concreteState.getDocumentUserMembers(documentId);

      for (const connectionId of members) {
        if (!connectedIds.has(connectionId)) {
          // This connection is stale — remove it
          await this.state.removeUserFromDocument(documentId, connectionId);
          const count = await this.state.getUserCount(documentId);

          if (count === 0) {
            const finalContent = await this.state.getContent(documentId);
            const accessToken = this.getTokenForDocumentSave(documentId);
            if (finalContent !== null && finalContent !== this.lastSavedContent.get(documentId)) {
              await concreteState.publishSaveEvent(documentId, finalContent);
              if (accessToken) {
                await this.documentAccessClient.saveDocumentContent(documentId, finalContent, accessToken);
              }
              this.lastSavedContent.set(documentId, finalContent);
              console.log(`[Write-Back Sweeper] Flushed final document ${documentId} to PostgreSQL on room close`);
            }
            await this.state.deleteContent(documentId);
            const operationLog = this.state.getOperationLog();
            await operationLog.deleteOperations(documentId);
            this.documentTokens.delete(documentId);
            this.lastEditorByDocument.delete(documentId);
            this.lastSavedContent.delete(documentId);
          }

          this.removeDocumentToken(documentId, connectionId);
          this.io.to(documentId).emit('UserLeft', connectionId, count, documentId);
          await this.state.removeConnection(connectionId);
          swept++;
        }
      }
    }

    if (swept > 0) {
      console.log(`Sweeper: cleaned up ${swept} stale connection(s)`);
    }
  }

  private getAccessToken(socket: Socket): string {
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.substring(7).trim();
    }

    const authObjectToken = socket.handshake.auth?.token;
    if (typeof authObjectToken === 'string' && authObjectToken.trim()) {
      return authObjectToken.trim();
    }

    return '';
  }

  private async handleJoinDocument(socket: Socket, documentId: string, initialContent?: string): Promise<void> {
    try {
      if (!documentId || !documentId.trim()) {
        socket.emit('Error', 'A document id is required.');
        return;
      }

      const accessToken = this.getAccessToken(socket);
      const accessLevel = await this.documentAccessClient.getAccessLevel(documentId, accessToken);

      if (!accessLevel) {
        socket.emit('Error', 'You do not have access to this document.');
        return;
      }

      if (accessToken && accessLevel === 'Edit') {
        this.setDocumentToken(documentId, socket.id, accessToken);
      }

      const wasAdded = await this.state.addUserToDocument(documentId, socket.id, accessLevel);
      if (!wasAdded) {
        console.log(`Connection ${socket.id} already in document ${documentId}`);
        return;
      }

      socket.join(documentId);
      const activeCount = await this.state.getUserCount(documentId);

      console.log(`User ${socket.id} joined document ${documentId}. Active users: ${activeCount}`);

      let currentContent = await this.state.getContent(documentId);
      if ((currentContent === null || currentContent === undefined) && typeof initialContent === 'string' && initialContent.length > 0) {
        await this.state.setContent(documentId, initialContent);
        currentContent = initialContent;
      }

      if (currentContent !== null && currentContent !== undefined) {
        socket.emit('ReceiveContentUpdate', { documentId, content: currentContent });
      }

      this.io.to(documentId).emit('UserJoined', socket.id, activeCount, documentId);
    } catch (error: any) {
      console.error(`Error joining document ${documentId}:`, error);
      socket.emit('Error', error.message || 'Failed to join document.');
    }
  }

  private async handleLeaveDocument(socket: Socket, documentId: string): Promise<void> {
    try {
      const wasRemoved = await this.state.removeUserFromDocument(documentId, socket.id);
      if (!wasRemoved) return;

      socket.leave(documentId);
      const activeCount = await this.state.getUserCount(documentId);

      console.log(`User ${socket.id} left document ${documentId}. Active users: ${activeCount}`);

      if (activeCount === 0) {
        const concreteState = this.state as RedisDocumentStateService;
        const finalContent = await this.state.getContent(documentId);
        const accessToken = this.getTokenForDocumentSave(documentId);
        if (finalContent !== null && finalContent !== this.lastSavedContent.get(documentId)) {
          await concreteState.publishSaveEvent(documentId, finalContent);
          if (accessToken) {
            await this.documentAccessClient.saveDocumentContent(documentId, finalContent, accessToken);
          }
          this.lastSavedContent.set(documentId, finalContent);
          console.log(`[Write-Back] Flushed final content for document ${documentId} to PostgreSQL on room close`);
        }
        await this.state.deleteContent(documentId);
        const operationLog = this.state.getOperationLog();
        await operationLog.deleteOperations(documentId);
        this.documentTokens.delete(documentId);
        this.lastEditorByDocument.delete(documentId);
        this.lastSavedContent.delete(documentId);
      }

      this.io.to(documentId).emit('UserLeft', socket.id, activeCount, documentId);
      this.removeDocumentToken(documentId, socket.id);
    } catch (error: any) {
      console.error(`Error leaving document ${documentId}:`, error);
    }
  }

  private async handleSendContentUpdate(socket: Socket, arg1: any, arg2?: any): Promise<void> {
    let documentId: string;
    let content: string;

    if (typeof arg1 === 'object' && arg1 !== null) {
      documentId = arg1.documentId || arg1.fileId;
      content = arg1.content !== undefined && arg1.content !== null ? String(arg1.content) : '';
    } else {
      documentId = arg1;
      content = arg2 !== undefined && arg2 !== null ? String(arg2) : '';
    }

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (accessLevel !== 'Edit') {
        socket.emit('Error', 'You do not have edit access to this document.');
        return;
      }

      await this.state.setContent(documentId, content);
      this.lastEditorByDocument.set(documentId, socket.id);
      socket.to(documentId).emit('ReceiveContentUpdate', { documentId, content });
    } catch (error: any) {
      console.error(`Error sending content update for document ${documentId}:`, error);
      socket.emit('Error', error.message || 'Failed to send content update.');
    }
  }

  private async handleSendOperation(socket: Socket, arg1: any, arg2?: any): Promise<void> {
    let documentId: string;
    let operation: Operation;

    if (typeof arg1 === 'object' && arg1 !== null && 'operation' in arg1) {
      documentId = arg1.documentId || arg1.fileId;
      operation = arg1.operation;
    } else {
      documentId = arg1;
      operation = arg2;
    }

    if (!operation) {
      socket.emit('Error', 'Operation cannot be null.');
      return;
    }

    if (!documentId || !documentId.trim()) {
      socket.emit('Error', 'Document ID is required.');
      return;
    }

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (accessLevel !== 'Edit') {
        socket.emit('Error', 'You do not have edit access to this document.');
        return;
      }

      const operationLog = this.state.getOperationLog();
      const currentRevision = await operationLog.getCurrentRevision(documentId);

      const concurrentOps = await operationLog.getOperationsSince(documentId, operation.clientRevision);

      let transformedOp: Operation = { ...operation, serverRevision: currentRevision + 1 };
      for (const concurrentOp of concurrentOps) {
        transformedOp = this.conflictResolver.transformAgainstConcurrent(transformedOp, concurrentOp);
      }

      // Atomically claim the next revision and store — eliminates TOCTOU race between read and write
      const committedOp = await operationLog.appendOperationAtomically(documentId, transformedOp);

      const currentContent = (await this.state.getContent(documentId)) || '';
      const updatedContent = this.conflictResolver.applyOperation(currentContent, committedOp);
      await this.state.setContent(documentId, updatedContent);
      this.lastEditorByDocument.set(documentId, socket.id);

      console.log(
        `Operation applied for document ${documentId} by ${socket.id}. ServerRevision: ${committedOp.serverRevision}`
      );

      // Periodic Operation Log Compaction & Snapshot Checkpointing (every 100 revisions)
      if (committedOp.serverRevision % 100 === 0) {
        void (async () => {
          try {
            await operationLog.saveSnapshot(documentId, committedOp.serverRevision, updatedContent);
            const minKeepRevision = committedOp.serverRevision - 200;
            if (minKeepRevision > 0) {
              const pruned = await operationLog.pruneOperationsOlderThan(documentId, minKeepRevision);
              if (pruned > 0) {
                console.log(`[Log Compaction] Pruned ${pruned} operations for doc ${documentId} (< rev ${minKeepRevision})`);
              }
            }
          } catch (compactErr) {
            console.warn(`[Log Compaction] Failed compaction for doc ${documentId}:`, compactErr);
          }
        })();
      }

      this.io.to(documentId).emit('ReceiveOperation', committedOp);
    } catch (error: any) {
      console.error(`Error processing operation for document ${documentId}:`, error);
      socket.emit('Error', `Failed to process operation: ${error.message}`);
    }
  }

  private async handleRequestMissedOperations(socket: Socket, arg1: any, arg2?: any): Promise<void> {
    let documentId: string;
    let fromRevision: number;

    if (typeof arg1 === 'object' && arg1 !== null) {
      documentId = arg1.documentId;
      fromRevision = arg1.fromRevision;
    } else {
      documentId = arg1;
      fromRevision = arg2;
    }

    if (!documentId || !documentId.trim()) {
      socket.emit('Error', 'Document ID is required.');
      return;
    }

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (!accessLevel) {
        socket.emit('Error', 'Join the document before requesting missed operations.');
        return;
      }

      const operationLog = this.state.getOperationLog();
      const missedOps = await operationLog.getOperationsSince(documentId, fromRevision);

      console.log(
        `Sending ${missedOps.length} missed operations to ${socket.id} for document ${documentId} since revision ${fromRevision}`
      );

      for (const op of missedOps) {
        socket.emit('ReceiveOperation', op);
      }

      const currentRevision = await operationLog.getCurrentRevision(documentId);
      socket.emit('ResyncComplete', currentRevision);
    } catch (error: any) {
      console.error(`Error sending missed operations for document ${documentId}:`, error);
      socket.emit('Error', `Failed to retrieve missed operations: ${error.message}`);
    }
  }

  private async handleSendCursorPosition(socket: Socket, arg1: any, arg2?: any): Promise<void> {
    let documentId: string;
    let payload: any = {};

    if (typeof arg1 === 'object' && arg1 !== null) {
      documentId = arg1.documentId;
      payload = arg1;
    } else {
      documentId = arg1;
      payload = { position: arg2 };
    }

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (!accessLevel) {
        socket.emit('Error', 'Join the document before sending cursor updates.');
        return;
      }

      const color = (await this.state.getColor(socket.id)) || '#2196F3';
      socket.to(documentId).emit('ReceiveCursorUpdate', {
        documentId,
        userId: socket.id,
        position: payload.position ?? 0,
        selectionStart: payload.selectionStart ?? payload.position ?? 0,
        selectionEnd: payload.selectionEnd ?? payload.position ?? 0,
        lineNumber: payload.lineNumber ?? 1,
        scrollLine: payload.scrollLine ?? 1,
        userName: payload.userName || 'Anonymous',
        color,
      });
    } catch (error: any) {
      console.error(`Error sending cursor position for document ${documentId}:`, error);
    }
  }

  private async handleCommentEvent(socket: Socket, eventName: string, data: any): Promise<void> {
    const documentId = data?.documentId;
    if (!documentId) return;

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (!accessLevel) return;

      this.io.to(documentId).emit(eventName, data);
    } catch (error: any) {
      console.error(`Error handling comment event ${eventName}:`, error);
    }
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    console.log(`Connection disconnected: ${socket.id}`);
    try {
      const docs = await this.state.getDocumentsForConnection(socket.id);
      const operationLog = this.state.getOperationLog();

      for (const documentId of Object.keys(docs)) {
        await this.state.removeUserFromDocument(documentId, socket.id);
        const count = await this.state.getUserCount(documentId);

        console.log(`Auto-removed ${socket.id} from document ${documentId}. Remaining: ${count}`);

        if (count === 0) {
          const finalContent = await this.state.getContent(documentId);
          const accessToken = this.getTokenForDocumentSave(documentId);
          if (finalContent !== null && finalContent !== this.lastSavedContent.get(documentId)) {
            if (this.state instanceof RedisDocumentStateService) {
              await (this.state as RedisDocumentStateService).publishSaveEvent(documentId, finalContent);
            }
            if (accessToken) {
              await this.documentAccessClient.saveDocumentContent(documentId, finalContent, accessToken);
            }
            this.lastSavedContent.set(documentId, finalContent);
            console.log(`[Write-Back Disconnect] Flushed final content for document ${documentId} to PostgreSQL`);
          }
          await this.state.deleteContent(documentId);
          await operationLog.deleteOperations(documentId);
          this.documentTokens.delete(documentId);
          this.lastEditorByDocument.delete(documentId);
          this.lastSavedContent.delete(documentId);
        }

        this.io.to(documentId).emit('UserLeft', socket.id, count, documentId);
        this.removeDocumentToken(documentId, socket.id);
      }

      await this.state.removeConnection(socket.id);
    } catch (error: any) {
      console.error(`Error during disconnect cleanup for ${socket.id}:`, error);
    }
  }

  private setDocumentToken(documentId: string, socketId: string, accessToken: string): void {
    const tokenBySocket = this.documentTokens.get(documentId) ?? new Map<string, string>();
    tokenBySocket.set(socketId, accessToken);
    this.documentTokens.set(documentId, tokenBySocket);
  }

  private removeDocumentToken(documentId: string, socketId: string): void {
    const tokenBySocket = this.documentTokens.get(documentId);
    if (!tokenBySocket) return;

    tokenBySocket.delete(socketId);
    if (tokenBySocket.size === 0) {
      this.documentTokens.delete(documentId);
    } else {
      this.documentTokens.set(documentId, tokenBySocket);
    }

    if (this.lastEditorByDocument.get(documentId) === socketId) {
      this.lastEditorByDocument.delete(documentId);
    }
  }

  private getTokenForDocumentSave(documentId: string): string | undefined {
    const tokenBySocket = this.documentTokens.get(documentId);
    if (!tokenBySocket || tokenBySocket.size === 0) {
      return undefined;
    }

    const preferredSocketId = this.lastEditorByDocument.get(documentId);
    if (preferredSocketId) {
      const preferredToken = tokenBySocket.get(preferredSocketId);
      if (preferredToken) {
        return preferredToken;
      }
    }

    return tokenBySocket.values().next().value;
  }

  private handleJoinWorkspace(socket: Socket, workspaceId: string): void {
    if (!workspaceId) return;
    const roomName = `workspace:${workspaceId}`;
    socket.join(roomName);
    socket.emit('WorkspaceJoined', { workspaceId });
    console.log(`Socket ${socket.id} joined workspace room: ${roomName}`);
  }

  private handleLeaveWorkspace(socket: Socket, workspaceId: string): void {
    if (!workspaceId) return;
    const roomName = `workspace:${workspaceId}`;
    socket.leave(roomName);
    socket.emit('WorkspaceLeft', { workspaceId });
    console.log(`Socket ${socket.id} left workspace room: ${roomName}`);
  }

  private handleWorkspaceChange(socket: Socket, data: any): void {
    const workspaceId = data?.workspaceId || data?.folderId || data?.projectId || '';
    if (!workspaceId) return;

    const payload = {
      ...data,
      workspaceId,
      senderSocketId: socket.id,
      timestamp: data.timestamp || Date.now(),
    };

    // Broadcast to other collaborators connected to the same workspace room
    socket.to(`workspace:${workspaceId}`).emit('ReceiveWorkspaceChange', payload);
  }

  private handleJoinUser(socket: Socket, userId: string): void {
    if (!userId) return;
    const roomName = `user:${userId}`;
    socket.join(roomName);
    socket.emit('UserJoinedChannel', { userId });
    console.log(`Socket ${socket.id} joined private user room: ${roomName}`);
  }

  private handleUpdateCollaboratorPermission(socket: Socket, data: any): void {
    if (!data || !data.targetUserId) return;
    const payload = {
      targetUserId: data.targetUserId,
      accessLevel: data.accessLevel || 'View',
      workspaceId: data.workspaceId,
      documentId: data.documentId,
      senderSocketId: socket.id,
      timestamp: Date.now(),
    };

    // 1. Direct targeted delivery to the collaborator's private user channel (ARCH-06)
    this.io.to(`user:${data.targetUserId}`).emit('ReceivePermissionUpdated', payload);
    this.io.to(`user:${data.targetUserId}`).emit('permissionUpdated', payload);

    // 2. Deliver to workspace room if present
    if (data.workspaceId) {
      this.io.to(`workspace:${data.workspaceId}`).emit('ReceivePermissionUpdated', payload);
      this.io.to(`workspace:${data.workspaceId}`).emit('permissionUpdated', payload);
    }

    // 3. Deliver to document room if present
    if (data.documentId) {
      this.io.to(`document:${data.documentId}`).emit('ReceivePermissionUpdated', payload);
      this.io.to(`document:${data.documentId}`).emit('permissionUpdated', payload);
      this.io.to(data.documentId).emit('ReceivePermissionUpdated', payload);
      this.io.to(data.documentId).emit('permissionUpdated', payload);
    }

    // 4. Global broadcast fallback
    socket.broadcast.emit('ReceivePermissionUpdated', payload);
    socket.broadcast.emit('permissionUpdated', payload);
  }
}
