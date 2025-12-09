using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace LiveSync.Hubs
{
    // A ConcurrentDictionary to simulate a fast in-memory cache of who is in which "room" (document)
    public class EditorHub : Hub
    {
        // Key: DocumentId, Value: List of ConnectionIds
        private static readonly ConcurrentDictionary<string, List<string>> _documentUsers = new();

        public async Task JoinDocument(string documentId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, documentId);

            // Track user (simplified)
            _documentUsers.AddOrUpdate(documentId,
                new List<string> { Context.ConnectionId },
                (_, list) => { list.Add(Context.ConnectionId); return list; });

            await Clients.Group(documentId).SendAsync("UserJoined", Context.ConnectionId);
        }

        public async Task LeaveDocument(string documentId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, documentId);
            await Clients.Group(documentId).SendAsync("UserLeft", Context.ConnectionId);
        }

        // The critical method: Broadcasting changes
        public async Task SendContentUpdate(string documentId, string content)
        {
            // EXCLUDE the sender! We don't want to overwrite their own screen while they type.
            await Clients.GroupExcept(documentId, Context.ConnectionId)
                         .SendAsync("ReceiveContentUpdate", content);
        }
    }
}