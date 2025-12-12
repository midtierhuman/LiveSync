using LiveSync.Api.DTOs;

namespace LiveSync.Api.Services
{
    public interface IDocumentService
    {
        // Document operations
        Task<DocumentDto?> GetDocumentByIdAsync(string documentId, string userId);
        Task<List<DocumentDto>> GetUserDocumentsAsync(string userId);
        Task<List<SharedDocumentDto>> GetSharedDocumentsAsync(string userId);
        Task<DocumentDto> CreateDocumentAsync(string userId, CreateDocumentRequest request);
        Task<DocumentDto?> UpdateDocumentAsync(string documentId, string userId, UpdateDocumentRequest request);
        Task<bool> DeleteDocumentAsync(string documentId, string userId);
        Task<DocumentDto?> UpdateContentAsync(string documentId, string userId, DocumentContentUpdateRequest request);

        // Share operations
        Task<DocumentDto?> GenerateShareCodeAsync(string documentId, string userId);
        Task<DocumentDto?> GetDocumentByShareCodeAsync(string shareCode);
        Task<bool> AddSharedDocumentAsync(string shareCode, string userId);
        Task<bool> RemoveSharedAccessAsync(string documentId, string userId, string sharedUserId);

        // Helper
        string GenerateShareCode();
    }
}
