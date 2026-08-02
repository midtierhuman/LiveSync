import { Server, Socket } from 'socket.io';
import { EditorHub } from '../hubs/editorHub';
import { IDocumentStateService } from '../services/documentStateService';
import { DocumentAccessClient } from '../services/documentAccessClient';
import { ConflictResolver } from '../services/conflictResolver';

export function setupEditorSocket(
  io: Server,
  state: IDocumentStateService,
  documentAccessClient: DocumentAccessClient,
  conflictResolver: ConflictResolver
): EditorHub {
  const hub = new EditorHub(io, state, documentAccessClient, conflictResolver);

  // Bind to /hubs/editor namespace
  const editorNamespace = io.of('/hubs/editor');
  editorNamespace.on('connection', (socket: Socket) => {
    hub.registerHandlers(socket);
  });

  // Also bind default namespace — the frontend client connects here
  io.on('connection', (socket: Socket) => {
    hub.registerHandlers(socket);
  });

  return hub;
}
