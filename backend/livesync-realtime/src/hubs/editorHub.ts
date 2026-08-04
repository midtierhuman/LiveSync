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

    // Handler registrations supporting both SignalR style casing (JoinDocument) and JS style (joinDocument)
    socket.on('JoinDocument', (docId: string) => this.handleJoinDocument(socket, docId));
    socket.on('joinDocument', (docId: string) => this.handleJoinDocument(socket, docId));

    socket.on('LeaveDocument', (docId: string) => this.handleLeaveDocument(socket, docId));
    socket.on('leaveDocument', (docId: string) => this.handleLeaveDocument(socket, docId));

    socket.on('SendContentUpdate', (arg1: any, arg2?: any) => this.handleSendContentUpdate(socket, arg1, arg2));
    socket.on('sendContentUpdate', (arg1: any, arg2?: any) => this.handleSendContentUpdate(socket, arg1, arg2));

    socket.on('SendOperation', (arg1: any, arg2?: any) => this.handleSendOperation(socket, arg1, arg2));
    socket.on('sendOperation', (arg1: any, arg2?: any) => this.handleSendOperation(socket, arg1, arg2));

    socket.on('RequestMissedOperations', (arg1: any, arg2?: any) => this.handleRequestMissedOperations(socket, arg1, arg2));
    socket.on('requestMissedOperations', (arg1: any, arg2?: any) => this.handleRequestMissedOperations(socket, arg1, arg2));

    socket.on('GetRevisionHistory', (docId: string) => this.handleGetRevisionHistory(socket, docId));
    socket.on('getRevisionHistory', (docId: string) => this.handleGetRevisionHistory(socket, docId));

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

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  /**
   * Starts a periodic sweep that removes stale connection IDs from Redis.
   * Call this once after constructing the hub.
   */
  public startStaleConnectionSweeper(intervalMs: number = 120000): void {
    setInterval(() => {
      this.sweepStaleConnections().catch((err: unknown) =>
        console.error('Stale connection sweep error:', err)
      );
    }, intervalMs);
    console.log(`Stale connection sweeper started (every ${intervalMs / 1000}s)`);
  }

  private async sweepStaleConnections(): Promise<void> {
    // Only works when state is the concrete Redis implementation
    if (!(this.state instanceof RedisDocumentStateService)) return;

    const concreteState = this.state as RedisDocumentStateService;
    const documentIds = await concreteState.getAllDocumentUserKeys();

    // Fetch socket IDs across ALL replicas via the Redis adapter
    const allSockets = await this.io.fetchSockets();
    const connectedIds = new Set<string>(allSockets.map(s => s.id));

    // Also include sockets on the /hubs/editor namespace
    const editorSockets = await this.io.of('/hubs/editor').fetchSockets();
    for (const s of editorSockets) connectedIds.add(s.id);

    let swept = 0;
    for (const documentId of documentIds) {
      const members = await concreteState.getDocumentUserMembers(documentId);

      for (const connectionId of members) {
        if (!connectedIds.has(connectionId)) {
          // This connection is stale — remove it
          await this.state.removeUserFromDocument(documentId, connectionId);
          const count = await this.state.getUserCount(documentId);

          if (count === 0) {
            await this.state.deleteContent(documentId);
            const operationLog = this.state.getOperationLog();
            await operationLog.deleteOperations(documentId);
          }

          this.io.to(documentId).emit('UserLeft', connectionId, count);
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
    const queryToken = socket.handshake.query.access_token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

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

  private async handleJoinDocument(socket: Socket, documentId: string): Promise<void> {
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

      const wasAdded = await this.state.addUserToDocument(documentId, socket.id, accessLevel);
      if (!wasAdded) {
        console.log(`Connection ${socket.id} already in document ${documentId}`);
        return;
      }

      socket.join(documentId);
      const activeCount = await this.state.getUserCount(documentId);

      console.log(`User ${socket.id} joined document ${documentId}. Active users: ${activeCount}`);

      const currentContent = await this.state.getContent(documentId);
      if (currentContent !== null && currentContent !== undefined) {
        socket.emit('ReceiveContentUpdate', currentContent);
      }

      this.io.to(documentId).emit('UserJoined', socket.id, activeCount);
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
        await this.state.deleteContent(documentId);
        const operationLog = this.state.getOperationLog();
        await operationLog.deleteOperations(documentId);
      }

      this.io.to(documentId).emit('UserLeft', socket.id, activeCount);
    } catch (error: any) {
      console.error(`Error leaving document ${documentId}:`, error);
    }
  }

  private async handleSendContentUpdate(socket: Socket, arg1: any, arg2?: any): Promise<void> {
    let documentId: string;
    let content: string;

    if (typeof arg1 === 'object' && arg1 !== null) {
      documentId = arg1.documentId;
      content = arg1.content;
    } else {
      documentId = arg1;
      content = arg2;
    }

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (accessLevel !== 'Edit') {
        socket.emit('Error', 'You do not have edit access to this document.');
        return;
      }

      await this.state.setContent(documentId, content);
      socket.to(documentId).emit('ReceiveContentUpdate', content);
    } catch (error: any) {
      console.error(`Error sending content update for document ${documentId}:`, error);
      socket.emit('Error', error.message || 'Failed to send content update.');
    }
  }

  private async handleSendOperation(socket: Socket, arg1: any, arg2?: any): Promise<void> {
    let documentId: string;
    let operation: Operation;

    if (typeof arg1 === 'object' && arg1 !== null && 'operation' in arg1) {
      documentId = arg1.documentId;
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

      console.log(
        `Operation applied for document ${documentId} by ${socket.id}. ServerRevision: ${committedOp.serverRevision}`
      );

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

  private async handleGetRevisionHistory(socket: Socket, documentId: string): Promise<void> {
    if (!documentId || !documentId.trim()) {
      socket.emit('Error', 'Document ID is required.');
      return;
    }

    try {
      const accessLevel = await this.state.getAccess(socket.id, documentId);
      if (!accessLevel) {
        socket.emit('Error', 'Join the document before requesting revision history.');
        return;
      }

      const operationLog = this.state.getOperationLog();
      const ops = await operationLog.getOperationsSince(documentId, 0);
      const currentRevision = await operationLog.getCurrentRevision(documentId);
      const content = (await this.state.getContent(documentId)) || '';

      socket.emit('ReceiveRevisionHistory', {
        documentId,
        currentRevision,
        content,
        operations: ops,
      });
    } catch (error: any) {
      console.error(`Error retrieving revision history for document ${documentId}:`, error);
      socket.emit('Error', `Failed to retrieve revision history: ${error.message}`);
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
        userId: socket.id,
        position: payload.position ?? 0,
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
          await this.state.deleteContent(documentId);
          await operationLog.deleteOperations(documentId);
        }

        this.io.to(documentId).emit('UserLeft', socket.id, count);
      }

      await this.state.removeConnection(socket.id);
    } catch (error: any) {
      console.error(`Error during disconnect cleanup for ${socket.id}:`, error);
    }
  }
}
