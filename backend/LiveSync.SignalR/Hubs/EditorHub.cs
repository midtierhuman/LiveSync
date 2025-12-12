using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace LiveSync.Hubs
{
    // A ConcurrentDictionary to simulate a fast in-memory cache of who is in which "room" (document)
    public class EditorHub : Hub
    {
        // Key: DocumentId, Value: List of ConnectionIds
        private static readonly ConcurrentDictionary<string, List<string>> _documentUsers = new();
        private static readonly ConcurrentDictionary<string, string> _userColors = new();
        // Store current document content
        private static readonly ConcurrentDictionary<string, string> _documentContent = new();

        public async Task JoinDocument(string documentId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, documentId);

            // Track user (simplified)
            _documentUsers.AddOrUpdate(documentId,
                new List<string> { Context.ConnectionId },
                (_, list) => { list.Add(Context.ConnectionId); return list; });

            // Get the current count
            var activeCount = _documentUsers[documentId].Count;

            // Send the current document content to the joining user FIRST
            if (_documentContent.TryGetValue(documentId, out var currentContent))
            {
                await Clients.Caller.SendAsync("ReceiveContentUpdate", currentContent);
            }

            // Then broadcast join event to all
            await Clients.Group(documentId).SendAsync("UserJoined", Context.ConnectionId, activeCount);
        }

        public async Task LeaveDocument(string documentId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, documentId);

            if (_documentUsers.TryGetValue(documentId, out var users))
            {
                users.Remove(Context.ConnectionId);
                var count = users.Count;
                await Clients.Group(documentId).SendAsync("UserLeft", Context.ConnectionId, count);
            }
        }

        // The critical method: Broadcasting changes
        public async Task SendContentUpdate(string documentId, string content)
        {
            // Store the latest content
            _documentContent[documentId] = content;
            
            // Broadcast to others (excluding sender)
            await Clients.OthersInGroup(documentId)
                         .SendAsync("ReceiveContentUpdate", content);
        }

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