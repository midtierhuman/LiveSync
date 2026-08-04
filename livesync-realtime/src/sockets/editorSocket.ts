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

  io.on('connection', (socket: Socket) => {
    hub.registerHandlers(socket);
  });

  return hub;
}
