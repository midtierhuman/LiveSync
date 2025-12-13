using LiveSync.Api.Data;
using LiveSync.Api.DTOs;
using LiveSync.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace LiveSync.Api.Services
{
    public class DocumentService : IDocumentService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<DocumentService> _logger;

        public DocumentService(ApplicationDbContext context, ILogger<DocumentService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<DocumentDto?> GetDocumentByIdAsync(string documentId, string userId)
        {
            try
            {
                var document = await _context.Documents
                    .Include(d => d.Owner)
                    .Include(d => d.SharedWith)
                    .ThenInclude(s => s.User)
                    .FirstOrDefaultAsync(d => d.Id == documentId);

                if (document == null)
                    return null;

                // Check if user is owner or has shared access
                if (document.OwnerId != userId && !document.SharedWith.Any(s => s.UserId == userId))
                    return null;

                return MapToDto(document);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting document");
                return null;
            }
        }

        public async Task<List<DocumentDto>> GetUserDocumentsAsync(string userId)
        {
            try
            {
                var documents = await _context.Documents
                    .Include(d => d.Owner)
                    .Include(d => d.SharedWith)
                    .Where(d => d.OwnerId == userId)
                    .OrderByDescending(d => d.UpdatedAt)
                    .ToListAsync();

                return documents.Select(MapToDto).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user documents");
                return new List<DocumentDto>();
            }
        }

        public async Task<List<SharedDocumentDto>> GetSharedDocumentsAsync(string userId)
        {
            try
            {
                var sharedDocs = await _context.SharedDocuments
                    .Include(s => s.Document)
                    .ThenInclude(d => d!.Owner)
                    .Include(s => s.User)
                    .Where(s => s.UserId == userId)
                    .OrderByDescending(s => s.SharedAt)
                    .ToListAsync();

                return sharedDocs.Select(MapSharedToDto).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting shared documents");
                return new List<SharedDocumentDto>();
            }
        }

        public async Task<DocumentDto> CreateDocumentAsync(string userId, CreateDocumentRequest request)
        {
            try
            {
                var document = new Document
                {
                    Title = request.Title,
                    Content = request.Content,
                    OwnerId = userId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Documents.Add(document);
                await _context.SaveChangesAsync();

                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    document.Owner = user;
                }

                return MapToDto(document);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating document");
                throw;
            }
        }

        public async Task<DocumentDto?> UpdateDocumentAsync(string documentId, string userId, UpdateDocumentRequest request)
        {
            try
            {
                var document = await _context.Documents
                    .Include(d => d.Owner)
                    .Include(d => d.SharedWith)
                    .FirstOrDefaultAsync(d => d.Id == documentId);

                if (document == null)
                    return null;

                // Check if user has edit access (owner or shared with Edit permission)
                if (!await HasEditAccessAsync(documentId, userId))
                    return null;

                if (!string.IsNullOrEmpty(request.Title))
                    document.Title = request.Title;

                if (!string.IsNullOrEmpty(request.Content))
                    document.Content = request.Content;

                document.UpdatedAt = DateTime.UtcNow;
                document.LastEditedAt = DateTime.UtcNow;
                document.LastEditedBy = request.LastEditedBy ?? userId;

                await _context.SaveChangesAsync();
                return MapToDto(document);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating document");
                return null;
            }
        }

        public async Task<bool> DeleteDocumentAsync(string documentId, string userId)
        {
            try
            {
                var document = await _context.Documents.FindAsync(documentId);

                if (document == null || document.OwnerId != userId)
                    return false;

                _context.Documents.Remove(document);
                await _context.SaveChangesAsync();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting document");
                return false;
            }
        }

        public async Task<DocumentDto?> UpdateContentAsync(string documentId, string userId, DocumentContentUpdateRequest request)
        {
            try
            {
                var document = await _context.Documents
                    .Include(d => d.Owner)
                    .Include(d => d.SharedWith)
                    .FirstOrDefaultAsync(d => d.Id == documentId);

                if (document == null)
                    return null;

                // Check if user has edit access
                if (!await HasEditAccessAsync(documentId, userId))
                    return null;

                document.Content = request.Content;
                document.UpdatedAt = DateTime.UtcNow;
                document.LastEditedAt = DateTime.UtcNow;
                document.LastEditedBy = request.LastEditedBy ?? userId;

                await _context.SaveChangesAsync();
                return MapToDto(document);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating content");
                return null;
            }
        }

        public async Task<DocumentDto?> GenerateShareCodeAsync(string documentId, string userId)
        {
            try
            {
                var document = await _context.Documents
                    .Include(d => d.Owner)
                    .Include(d => d.SharedWith)
                    .FirstOrDefaultAsync(d => d.Id == documentId);

                if (document == null || document.OwnerId != userId)
                    return null;

                document.ShareCode = GenerateShareCode();
                await _context.SaveChangesAsync();
                return MapToDto(document);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating share code");
                return null;
            }
        }

        public async Task<DocumentDto?> GetDocumentByShareCodeAsync(string shareCode)
        {
            try
            {
                var document = await _context.Documents
                    .Include(d => d.Owner)
                    .Include(d => d.SharedWith)
                    .FirstOrDefaultAsync(d => d.ShareCode == shareCode);

                return document == null ? null : MapToDto(document);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting document by share code");
                return null;
            }
        }

        public async Task<bool> AddSharedDocumentAsync(string shareCode, string userId)
        {
            try
            {
                // Find document by share code
                var document = await _context.Documents
                    .FirstOrDefaultAsync(d => d.ShareCode == shareCode);

                if (document == null)
                    return false;

                // Check if user already has access
                var existingShare = await _context.SharedDocuments
                    .FirstOrDefaultAsync(s => s.DocumentId == document.Id && s.UserId == userId);

                if (existingShare != null)
                    return false; // Already has access

                // Use the document's default access level for the share code
                var accessLevel = document.DefaultAccessLevel ?? "View";

                // Create new shared document entry with the document's default access level
                var sharedDoc = new SharedDocument
                {
                    Id = Guid.NewGuid().ToString(),
                    DocumentId = document.Id,
                    UserId = userId,
                    SharedAt = DateTime.UtcNow,
                    AccessLevel = accessLevel
                };

                _context.SharedDocuments.Add(sharedDoc);
                await _context.SaveChangesAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding shared document");
                return false;
            }
        }

        public async Task<bool> RemoveSharedAccessAsync(string documentId, string userId, string sharedUserId)
        {
            try
            {
                var document = await _context.Documents.FindAsync(documentId);
                if (document == null || document.OwnerId != userId)
                    return false;

                var sharedDoc = await _context.SharedDocuments
                    .FirstOrDefaultAsync(s => s.DocumentId == documentId && s.UserId == sharedUserId);

                if (sharedDoc == null)
                    return false;

                _context.SharedDocuments.Remove(sharedDoc);
                await _context.SaveChangesAsync();
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing shared access");
                return false;
            }
        }

        public async Task<bool> HasEditAccessAsync(string documentId, string userId)
        {
            try
            {
                // Check if user is the owner
                var document = await _context.Documents.FindAsync(documentId);
                if (document?.OwnerId == userId)
                    return true;

                // Check if user has shared access with Edit permission
                var sharedDoc = await _context.SharedDocuments
                    .FirstOrDefaultAsync(s => s.DocumentId == documentId && s.UserId == userId);

                return sharedDoc?.AccessLevel == "Edit";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking edit access");
                return false;
            }
        }

        public async Task<bool> UpdateSharedAccessLevelAsync(string documentId, string sharedUserId, string accessLevel)
        {
            try
            {
                // Validate access level
                if (accessLevel != "View" && accessLevel != "Edit")
                    return false;

                // Find the shared document entry
                var sharedDoc = await _context.SharedDocuments
                    .FirstOrDefaultAsync(s => s.DocumentId == documentId && s.UserId == sharedUserId);

                if (sharedDoc == null)
                    return false;

                // Update the access level
                sharedDoc.AccessLevel = accessLevel;
                await _context.SaveChangesAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating shared access level");
                return false;
            }
        }

        public async Task<bool> UpdateShareCodeAccessLevelAsync(string documentId, string userId, string accessLevel)
        {
            try
            {
                // Validate access level
                if (accessLevel != "View" && accessLevel != "Edit")
                    return false;

                // Find the document and verify ownership
                var document = await _context.Documents.FindAsync(documentId);
                if (document == null || document.OwnerId != userId)
                    return false;

                // Update the document's default access level
                document.DefaultAccessLevel = accessLevel;
                await _context.SaveChangesAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating share code access level");
                return false;
            }
        }

        public string GenerateShareCode()
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var random = new Random();
            return new string(Enumerable.Range(0, 8)
                .Select(_ => chars[random.Next(chars.Length)])
                .ToArray());
        }

        private DocumentDto MapToDto(Document document)
        {
            return new DocumentDto
            {
                Id = document.Id,
                Title = document.Title,
                Content = document.Content,
                OwnerId = document.OwnerId,
                OwnerName = document.Owner?.UserName ?? "Unknown",
                ShareCode = document.ShareCode,
                DefaultAccessLevel = document.DefaultAccessLevel,
                CreatedAt = document.CreatedAt,
                UpdatedAt = document.UpdatedAt,
                LastEditedAt = document.LastEditedAt,
                LastEditedBy = document.LastEditedBy,
                SharedWith = document.SharedWith?.Select(s => new SharedDocumentDto
                {
                    Id = s.Id,
                    DocumentId = s.DocumentId,
                    UserId = s.UserId,
                    UserName = s.User?.UserName ?? "Unknown",
                    SharedAt = s.SharedAt,
                    AccessLevel = s.AccessLevel ?? "View"
                }).ToList() ?? new List<SharedDocumentDto>()
            };
        }

        private SharedDocumentDto MapSharedToDto(SharedDocument shared)
        {
            return new SharedDocumentDto
            {
                Id = shared.Id,
                DocumentId = shared.DocumentId,
                DocumentTitle = shared.Document?.Title ?? "Unknown",
                UserId = shared.UserId,
                UserName = shared.User?.UserName ?? "Unknown",
                SharedAt = shared.SharedAt,
                AccessLevel = shared.AccessLevel ?? "View"
            };
        }
    }
}
