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

            // Get the current count
            var activeCount = _documentUsers[documentId].Count;

            // Broadcast to ALL users in the group (including the one who just joined)
            await Clients.Group(documentId).SendAsync("UserJoined", Context.ConnectionId, activeCount);
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
        private static readonly ConcurrentDictionary<string, string> _userColors = new();

        public override async Task OnConnectedAsync()
        {
            var color = GenerateRandomColor();
            _userColors[Context.ConnectionId] = color;
            await base.OnConnectedAsync();
        }

        public async Task SendCursorPosition(string documentId, int position)
        {
            var color = _userColors.GetValueOrDefault(Context.ConnectionId, "#2196F3");
            await Clients.OthersInGroup(documentId)
                .SendAsync("ReceiveCursorUpdate", Context.ConnectionId, position, color);
        }


        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            foreach (var doc in _documentUsers)
            {
                if (doc.Value.Remove(Context.ConnectionId))
                {
                    var count = doc.Value.Count;
                    await Clients.Group(doc.Key).SendAsync("UserLeft", Context.ConnectionId, count);
                }
            }
            _userColors.TryRemove(Context.ConnectionId, out _);
            await base.OnDisconnectedAsync(exception);
        }

        private static string GenerateRandomColor()
        {
            var colors = new[] { "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F" };
            return colors[Random.Shared.Next(colors.Length)];
        }
    }
}