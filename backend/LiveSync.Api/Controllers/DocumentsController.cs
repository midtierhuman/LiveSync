using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using LiveSync.Api.DTOs;
using LiveSync.Api.Services;
using System.Security.Claims;

namespace LiveSync.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class DocumentsController : ControllerBase
    {
        private readonly IDocumentService _documentService;
        private readonly ILogger<DocumentsController> _logger;

        public DocumentsController(IDocumentService documentService, ILogger<DocumentsController> logger)
        {
            _documentService = documentService;
            _logger = logger;
        }

        private string GetUserId()
        {
            return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? string.Empty;
        }

        /// <summary>
        /// Get all documents owned by the current user
        /// </summary>
        [HttpGet("my-documents")]
        [ProducesResponseType(typeof(List<DocumentDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<List<DocumentDto>>> GetMyDocuments()
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var documents = await _documentService.GetUserDocumentsAsync(userId);
            return Ok(documents);
        }

        /// <summary>
        /// Get all documents shared with the current user
        /// </summary>
        [HttpGet("shared-with-me")]
        [ProducesResponseType(typeof(List<SharedDocumentDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<List<SharedDocumentDto>>> GetSharedDocuments()
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var documents = await _documentService.GetSharedDocumentsAsync(userId);
            return Ok(documents);
        }

        /// <summary>
        /// Get a specific document by ID
        /// </summary>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(DocumentDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DocumentDto>> GetDocument(string id)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var document = await _documentService.GetDocumentByIdAsync(id, userId);
            if (document == null)
                return NotFound();

            return Ok(document);
        }

        /// <summary>
        /// Create a new document
        /// </summary>
        [HttpPost]
        [ProducesResponseType(typeof(DocumentDto), StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DocumentDto>> CreateDocument([FromBody] CreateDocumentRequest request)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var document = await _documentService.CreateDocumentAsync(userId, request);
            return CreatedAtAction(nameof(GetDocument), new { id = document.Id }, document);
        }

        /// <summary>
        /// Update a document (title and content)
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(DocumentDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<ActionResult<DocumentDto>> UpdateDocument(string id, [FromBody] UpdateDocumentRequest request)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            // Check if user has edit access
            var hasEditAccess = await _documentService.HasEditAccessAsync(id, userId);
            if (!hasEditAccess)
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "You don't have edit access to this document" });

            var document = await _documentService.UpdateDocumentAsync(id, userId, request);
            if (document == null)
                return NotFound();

            return Ok(document);
        }

        /// <summary>
        /// Update document content (for real-time updates)
        /// </summary>
        [HttpPut("{id}/content")]
        [ProducesResponseType(typeof(DocumentDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<ActionResult<DocumentDto>> UpdateContent(string id, [FromBody] DocumentContentUpdateRequest request)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            // Check if user has edit access
            var hasEditAccess = await _documentService.HasEditAccessAsync(id, userId);
            if (!hasEditAccess)
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "You don't have edit access to this document" });

            var document = await _documentService.UpdateContentAsync(id, userId, request);
            if (document == null)
                return NotFound();

            return Ok(document);
        }

        /// <summary>
        /// Delete a document
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<IActionResult> DeleteDocument(string id)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var result = await _documentService.DeleteDocumentAsync(id, userId);
            if (!result)
                return NotFound();

            return NoContent();
        }

        /// <summary>
        /// Generate or regenerate share code for a document
        /// </summary>
        [HttpPost("{id}/generate-share-code")]
        [ProducesResponseType(typeof(DocumentDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<DocumentDto>> GenerateShareCode(string id)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var document = await _documentService.GenerateShareCodeAsync(id, userId);
            if (document == null)
                return NotFound();

            return Ok(document);
        }

        /// <summary>
        /// Get document details by share code
        /// </summary>
        [AllowAnonymous]
        [HttpGet("share/{shareCode}")]
        [ProducesResponseType(typeof(DocumentDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<DocumentDto>> GetByShareCode(string shareCode)
        {
            var document = await _documentService.GetDocumentByShareCodeAsync(shareCode);
            if (document == null)
                return NotFound();

            return Ok(document);
        }

        /// <summary>
        /// Add a shared document to my documents using share code
        /// </summary>
        [HttpPost("add-shared")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<IActionResult> AddSharedDocument([FromBody] AddSharedDocumentRequest request)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var result = await _documentService.AddSharedDocumentAsync(
                request.ShareCode,
                userId);

            if (!result)
                return BadRequest(new { message = "Invalid share code or already added" });

            return Ok(new { message = "Document added successfully" });
        }

        /// <summary>
        /// Remove shared access to a document
        /// </summary>
        [HttpDelete("{documentId}/shared/{sharedUserId}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<IActionResult> RemoveSharedAccess(string documentId, string sharedUserId)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var result = await _documentService.RemoveSharedAccessAsync(documentId, userId, sharedUserId);
            if (!result)
                return NotFound();

            return NoContent();
        }

        /// <summary>
        /// Update the access level for a user who has shared access
        /// </summary>
        [HttpPut("{documentId}/shared/{sharedUserId}/access-level")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> UpdateSharedAccessLevel(
            string documentId,
            string sharedUserId,
            [FromBody] UpdateAccessLevelRequest request)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Verify that the requesting user is the document owner
            var document = await _documentService.GetDocumentByIdAsync(documentId, userId);
            if (document == null)
                return NotFound(new { message = "Document not found" });

            if (document.OwnerId != userId)
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Only the document owner can change access levels" });

            // Validate access level
            if (request.AccessLevel != "View" && request.AccessLevel != "Edit")
                return BadRequest(new { message = "Invalid access level. Must be 'View' or 'Edit'" });

            // Update the shared document access level
            var result = await _documentService.UpdateSharedAccessLevelAsync(
                documentId, sharedUserId, request.AccessLevel);

            if (!result)
                return NotFound(new { message = "Shared access not found" });

            return Ok(new { message = "Access level updated successfully" });
        }

        /// <summary>
        /// Update the default access level for a share code
        /// </summary>
        [HttpPut("{documentId}/share-code-access-level")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> UpdateShareCodeAccessLevel(
            string documentId,
            [FromBody] UpdateAccessLevelRequest request)
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Validate access level
            if (request.AccessLevel != "View" && request.AccessLevel != "Edit")
                return BadRequest(new { message = "Invalid access level. Must be 'View' or 'Edit'" });

            // Update the document's default access level (service validates ownership)
            var result = await _documentService.UpdateShareCodeAccessLevelAsync(
                documentId, userId, request.AccessLevel);

            if (!result)
                return NotFound(new { message = "Document not found or you are not the owner" });

            return Ok(new { message = "Share code access level updated successfully" });
        }
    }
}
