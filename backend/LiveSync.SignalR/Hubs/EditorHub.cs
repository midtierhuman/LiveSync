// Fixed EditorHub.cs - Replace your existing Hub with this code
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace LiveSync.Hubs
{
    [Authorize]
    public class EditorHub : Hub
    {
        private readonly ILogger<EditorHub> _logger;

        // Key: DocumentId, Value: HashSet of ConnectionIds (prevents duplicates)
        private static readonly ConcurrentDictionary<string, HashSet<string>> _documentUsers = new();
        private static readonly ConcurrentDictionary<string, string> _userColors = new();
        private static readonly ConcurrentDictionary<string, string> _documentContent = new();

        // Lock for thread-safe HashSet operations
        private static readonly object _lock = new object();

        public EditorHub(ILogger<EditorHub> logger)
        {
            _logger = logger;
        }

        public async Task JoinDocument(string documentId)
        {
            bool wasAdded = false;

            // Thread-safe add to HashSet
            lock (_lock)
            {
                var users = _documentUsers.GetOrAdd(documentId, _ => new HashSet<string>());
                wasAdded = users.Add(Context.ConnectionId); // Returns false if already exists
            }

            if (!wasAdded)
            {
                _logger.LogInformation("Connection {ConnectionId} already in document {DocumentId}", Context.ConnectionId, documentId);
                return; // Already joined, don't duplicate
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, documentId);

            // Get the current count
            int activeCount;
            lock (_lock)
            {
                activeCount = _documentUsers[documentId].Count;
            }

            _logger.LogInformation("User {ConnectionId} joined document {DocumentId}. Active users: {ActiveCount}", Context.ConnectionId, documentId, activeCount);

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
            bool wasRemoved = false;
            int activeCount = 0;

            lock (_lock)
            {
                if (_documentUsers.TryGetValue(documentId, out var users))
                {
                    wasRemoved = users.Remove(Context.ConnectionId);
                    activeCount = users.Count;

                    // Clean up empty document entries
                    if (activeCount == 0)
                    {
                        _documentUsers.TryRemove(documentId, out _);
                        _documentContent.TryRemove(documentId, out _);
                    }
                }
            }

            if (wasRemoved)
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, documentId);
                _logger.LogInformation("User {ConnectionId} left document {DocumentId}. Active users: {ActiveCount}", Context.ConnectionId, documentId, activeCount);
                await Clients.Group(documentId).SendAsync("UserLeft", Context.ConnectionId, activeCount);
            }
        }

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
            _logger.LogInformation("Connection established: {ConnectionId}", Context.ConnectionId);
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
            _logger.LogInformation("Connection disconnected: {ConnectionId}", Context.ConnectionId);

            // Remove from all documents
            var notificationTasks = new List<Task>();
            
            lock (_lock)
            {
                foreach (var doc in _documentUsers.ToArray()) // ToArray to avoid collection modification during iteration
                {
                    if (doc.Value.Remove(Context.ConnectionId))
                    {
                        var count = doc.Value.Count;
                        _logger.LogInformation("Auto-removed {ConnectionId} from document {DocumentId}. Remaining: {Count}", Context.ConnectionId, doc.Key, count);

                        // Collect notification tasks to await outside the lock
                        notificationTasks.Add(Clients.Group(doc.Key).SendAsync("UserLeft", Context.ConnectionId, count));

                        // Clean up empty document
                        if (count == 0)
                        {
                            _documentUsers.TryRemove(doc.Key, out _);
                            _documentContent.TryRemove(doc.Key, out _);
                        }
                    }
                }
            }

            // Await all notifications outside the lock
            await Task.WhenAll(notificationTasks);
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
