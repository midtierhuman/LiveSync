import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorHub } from './editorHub';
import { RedisDocumentStateService } from '../services/documentStateService';

test('EditorHub prefers last editor token and falls back safely', () => {
  const hub = new EditorHub({} as never, {} as never, {} as never, {} as never);
  const hubInternal = hub as any;

  hubInternal.setDocumentToken('doc-1', 'socket-a', 'token-a');
  hubInternal.setDocumentToken('doc-1', 'socket-b', 'token-b');
  hubInternal.lastEditorByDocument.set('doc-1', 'socket-b');

  assert.equal(hubInternal.getTokenForDocumentSave('doc-1'), 'token-b');

  hubInternal.removeDocumentToken('doc-1', 'socket-b');
  assert.equal(hubInternal.getTokenForDocumentSave('doc-1'), 'token-a');
});

test('EditorHub handles JoinWorkspace, LeaveWorkspace, and WorkspaceChange correctly', () => {
  const hub = new EditorHub({} as never, {} as never, {} as never, {} as never);
  const hubInternal = hub as any;

  const joinedRooms: string[] = [];
  const leftRooms: string[] = [];
  const emittedEvents: Array<{ event: string; data: any }> = [];
  const broadcastEvents: Array<{ room: string; event: string; data: any }> = [];

  const mockSocket: any = {
    id: 'socket-user-123',
    join: (room: string) => joinedRooms.push(room),
    leave: (room: string) => leftRooms.push(room),
    emit: (event: string, data: any) => emittedEvents.push({ event, data }),
    to: (room: string) => ({
      emit: (event: string, data: any) => broadcastEvents.push({ room, event, data }),
    }),
  };

  // 1. JoinWorkspace
  hubInternal.handleJoinWorkspace(mockSocket, 'folder-proj-456');
  assert.deepEqual(joinedRooms, ['workspace:folder-proj-456']);
  assert.deepEqual(emittedEvents[0], { event: 'WorkspaceJoined', data: { workspaceId: 'folder-proj-456' } });

  // 2. WorkspaceChange broadcast
  const changeEvent = {
    workspaceId: 'folder-proj-456',
    action: 'create',
    itemType: 'file',
    itemId: 'doc-789',
    name: 'app.component.ts',
  };
  hubInternal.handleWorkspaceChange(mockSocket, changeEvent);
  assert.equal(broadcastEvents.length, 1);
  assert.equal(broadcastEvents[0].room, 'workspace:folder-proj-456');
  assert.equal(broadcastEvents[0].event, 'ReceiveWorkspaceChange');
  assert.equal(broadcastEvents[0].data.action, 'create');
  assert.equal(broadcastEvents[0].data.itemId, 'doc-789');
  assert.equal(broadcastEvents[0].data.senderSocketId, 'socket-user-123');

  // 3. LeaveWorkspace
  hubInternal.handleLeaveWorkspace(mockSocket, 'folder-proj-456');
  assert.deepEqual(leftRooms, ['workspace:folder-proj-456']);
  assert.deepEqual(emittedEvents[1], { event: 'WorkspaceLeft', data: { workspaceId: 'folder-proj-456' } });
});

test('EditorHub fast-path rejects mutations for Viewer and emits PermissionDenied (PERF-05)', async () => {
  const mockState: any = {
    getAccess: async (socketId: string, docId: string) => 'View',
    setContent: async () => {},
  };

  const hub = new EditorHub({} as never, mockState, {} as never, {} as never);
  const hubInternal = hub as any;

  const emittedEvents: Array<{ event: string; data: any }> = [];
  const mockSocket: any = {
    id: 'socket-viewer-1',
    emit: (event: string, data: any) => emittedEvents.push({ event, data }),
    to: () => ({ emit: () => {} }),
  };

  // Attempt sendContentUpdate as Viewer
  await hubInternal.handleSendContentUpdate(mockSocket, { documentId: 'doc-locked', content: 'hacked' });

  assert.equal(emittedEvents.length, 2);
  assert.equal(emittedEvents[0].event, 'PermissionDenied');
  assert.equal(emittedEvents[0].data.documentId, 'doc-locked');
  assert.equal(emittedEvents[0].data.required, 'Edit');
  assert.equal(emittedEvents[0].data.current, 'View');
  assert.equal(emittedEvents[1].event, 'Error');

  // Attempt sendOperation as Viewer
  emittedEvents.length = 0;
  await hubInternal.handleSendOperation(mockSocket, {
    documentId: 'doc-locked',
    operation: { type: 'insert', position: 0, text: 'hello', clientRevision: 1 },
  });

  assert.equal(emittedEvents.length, 2);
  assert.equal(emittedEvents[0].event, 'PermissionDenied');
  assert.equal(emittedEvents[1].event, 'Error');
});

test('EditorHub writes through collaborator permission updates to Redis ACL and private channel (PERF-05)', async () => {
  let cachedDocACL: { docId: string; userId: string; perm: string } | null = null;
  const mockState: any = {
    setCachedDocumentACL: async (docId: string, userId: string, perm: string) => {
      cachedDocACL = { docId, userId, perm };
    },
  };

  const channelEmissions: Array<{ room: string; event: string; data: any }> = [];
  const mockIo: any = {
    to: (room: string) => ({
      emit: (event: string, data: any) => channelEmissions.push({ room, event, data }),
    }),
  };

  const hub = new EditorHub(mockIo, mockState, {} as never, {} as never);
  const hubInternal = hub as any;

  const mockSenderSocket: any = { id: 'sender-socket' };
  await hubInternal.handleUpdateCollaboratorPermission(mockSenderSocket, {
    targetUserId: 'user-collab-789',
    documentId: 'doc-shared-123',
    accessLevel: 'Edit',
  });

  // Verify write-through to ACL cache
  assert.deepEqual(cachedDocACL, {
    docId: 'doc-shared-123',
    userId: 'user-collab-789',
    perm: 'Edit',
  });

  // Verify targeted user and document room broadcasts
  const userBroadcasts = channelEmissions.filter(e => e.room === 'user:user-collab-789');
  assert.equal(userBroadcasts.length, 2);
  assert.equal(userBroadcasts[0].event, 'ReceivePermissionUpdated');
  assert.equal(userBroadcasts[0].data.accessLevel, 'Edit');

  const docBroadcasts = channelEmissions.filter(e => e.room === 'document:doc-shared-123');
  assert.equal(docBroadcasts.length, 2);
});

test('EditorHub PERF-11: schedules debounced dirty flusher and publishes save event', async () => {
  let publishedDocId = '';
  let publishedContent = '';
  let publishedUser = '';

  const mockRedisState: any = {
    getContent: async (docId: string) => 'console.log("hello world");',
    publishSaveEvent: async (docId: string, content: string, user?: string) => {
      publishedDocId = docId;
      publishedContent = content;
      publishedUser = user || '';
      return '12345-0';
    },
  };

  Object.setPrototypeOf(mockRedisState, RedisDocumentStateService.prototype);

  const hub = new EditorHub({} as never, mockRedisState, {} as never, {} as never);
  const hubInternal = hub as any;

  // 1. Flush dirty snapshot
  await hubInternal.flushSingleDocumentDirtySnapshot('doc-dirty-1');
  assert.equal(publishedDocId, 'doc-dirty-1');
  assert.equal(publishedContent, 'console.log("hello world");');
  assert.equal(publishedUser, 'debounced-write-behind');
  assert.equal(hubInternal.lastSavedContent.get('doc-dirty-1'), 'console.log("hello world");');

  // 2. Schedule debounce and cancel debounce
  hubInternal.scheduleDebouncedDirtyFlush('doc-dirty-2');
  assert.ok(hubInternal.dirtyDebounceTimers.has('doc-dirty-2'));
  hubInternal.cancelDebouncedDirtyFlush('doc-dirty-2');
  assert.equal(hubInternal.dirtyDebounceTimers.has('doc-dirty-2'), false);
});

test('EditorHub PERF-15: suppresses redundant cursor broadcasts with delta compression', async () => {
  const broadcastEvents: Array<{ room: string; event: string; data: any }> = [];
  const mockIo: any = {
    to: (room: string) => ({
      emit: (event: string, data: any) => broadcastEvents.push({ room, event, data }),
    }),
  };

  const mockState: any = {
    getAccess: async () => 'Edit',
    getColor: async () => '#FF5722',
  };

  const hub = new EditorHub(mockIo, mockState, {} as never, {} as never);
  const hubInternal = hub as any;

  const mockSocket: any = {
    id: 'socket-cursor-1',
    to: (room: string) => ({
      emit: (event: string, data: any) => broadcastEvents.push({ room, event, data }),
    }),
  };

  const payload1 = {
    documentId: 'doc-cursor-1',
    position: 42,
    selectionStart: 40,
    selectionEnd: 45,
    lineNumber: 5,
    userName: 'Alice',
  };

  // First dispatch: should broadcast
  await hubInternal.handleSendCursorPosition(mockSocket, payload1);
  assert.equal(broadcastEvents.length, 1);
  assert.equal(broadcastEvents[0].event, 'ReceiveCursorUpdate');
  assert.equal(broadcastEvents[0].data.position, 42);

  // Redundant second dispatch: delta compression should suppress packet
  await hubInternal.handleSendCursorPosition(mockSocket, payload1);
  assert.equal(broadcastEvents.length, 1); // No new emission

  // Modified third dispatch: should broadcast
  const payload2 = { ...payload1, position: 43 };
  await hubInternal.handleSendCursorPosition(mockSocket, payload2);
  assert.equal(broadcastEvents.length, 2);
  assert.equal(broadcastEvents[1].data.position, 43);
});



