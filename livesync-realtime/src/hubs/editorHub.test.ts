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
