import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorHub } from './editorHub';

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

