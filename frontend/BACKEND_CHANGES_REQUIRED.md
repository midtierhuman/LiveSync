# Backend Changes Required for Access Level Control

## Overview

The frontend has been updated to support access level control (View/Edit) for shared documents. The following changes need to be made to the backend API.

## Required Backend Changes

### 1. Update AddSharedDocumentRequest DTO

The DTO should only contain the share code:

```csharp
public class AddSharedDocumentRequest
{
    [Required]
    public string ShareCode { get; set; }
}
```

### 2. Update DocumentsController - AddSharedDocument Endpoint

The endpoint should get the access level from the share code settings, not from the user:

```csharp
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
```

### 3. Update IDocumentService Interface

Update the service interface:

```csharp
Task<bool> AddSharedDocumentAsync(string shareCode, string userId);
```

### 4. Update Document Model

Add a `DefaultAccessLevel` property to the Document model to store the access level associated with the share code:

```csharp
public class Document
{
    // ... existing properties ...
    public string? ShareCode { get; set; }
    public string DefaultAccessLevel { get; set; } = "View"; // Access level for this share code
}
```

### 5. Update DocumentService Implementation

Update the implementation to use the document's default access level:

```csharp
public async Task<bool> AddSharedDocumentAsync(string shareCode, string userId)
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
        AccessLevel = accessLevel // Use document's default access level
    };

    _context.SharedDocuments.Add(sharedDoc);
    await _context.SaveChangesAsync();

    return true;
}
```

### 6. Add UpdateShareCodeAccessLevel Endpoint

Add an endpoint to allow the document owner to update the default access level for the share code:

```csharp
/// <summary>
/// Update the default access level for a share code
/// </summary>
[HttpPut("{documentId}/share-code-access-level")]
[ProducesResponseType(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> UpdateShareCodeAccessLevel(
    string documentId,
    [FromBody] UpdateAccessLevelRequest request)
{
    var userId = GetUserId();
    if (string.IsNullOrEmpty(userId));
        return Unauthorized();

    // Verify that the requesting user is the document owner
    var document = await _context.Documents.FindAsync(documentId);
    if (document == null)
        return NotFound(new { message = "Document not found" });

    if (document.OwnerId != userId)
        return StatusCode(StatusCodes.Status403Forbidden,
            new { message = "Only the document owner can change the share code access level" });

    // Validate access level
    if (request.AccessLevel != "View" && request.AccessLevel != "Edit")
        return BadRequest(new { message = "Invalid access level" });

    // Update the document's default access level
    document.DefaultAccessLevel = request.AccessLevel;
    await _context.SaveChangesAsync();

    return Ok(new { message = "Share code access level updated successfully" });
}
```

### 7. Add Authorization Check for Edit Operations

Update the `UpdateDocument` and `UpdateContent` endpoints to check access level:

```csharp
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
```

### 8. Add HasEditAccessAsync Method to Service

```csharp
public async Task<bool> HasEditAccessAsync(string documentId, string userId)
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
```

### 9. Add UpdateSharedAccessLevel Endpoint

Add a new endpoint to allow document owners to change the access level of users who already have access:

```csharp
/// <summary>
/// Update the access level for a user who has shared access
/// </summary>
[HttpPut("{documentId}/shared/{sharedUserId}/access-level")]
[ProducesResponseType(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> UpdateSharedAccessLevel(
    string documentId,
    string sharedUserId,
    [FromBody] UpdateAccessLevelRequest request)
{
    var userId = GetUserId();
    if (string.IsNullOrEmpty(userId))
        return Unauthorized();

    // Verify that the requesting user is the document owner
    var document = await _context.Documents.FindAsync(documentId);
    if (document == null)
        return NotFound(new { message = "Document not found" });

    if (document.OwnerId != userId)
        return StatusCode(StatusCodes.Status403Forbidden,
            new { message = "Only the document owner can change access levels" });

    // Validate access level
    if (request.AccessLevel != "View" && request.AccessLevel != "Edit")
        return BadRequest(new { message = "Invalid access level" });

    // Update the shared document access level
    var result = await _documentService.UpdateSharedAccessLevelAsync(
        documentId, sharedUserId, request.AccessLevel);

    if (!result)
        return NotFound(new { message = "Shared access not found" });

    return Ok(new { message = "Access level updated successfully" });
}
```

### 10. Add UpdateAccessLevelRequest DTO

```csharp
public class UpdateAccessLevelRequest
{
    [Required]
    public string AccessLevel { get; set; }
}
```

### 11. Update IDocumentService Interface

Add the new method to the interface:

```csharp
Task<bool> UpdateSharedAccessLevelAsync(string documentId, string sharedUserId, string accessLevel);
```

### 12. Implement UpdateSharedAccessLevelAsync

Add the implementation in DocumentService:

```csharp
public async Task<bool> UpdateSharedAccessLevelAsync(
    string documentId,
    string sharedUserId,
    string accessLevel)
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
```

## Frontend Changes Already Implemented

1. ✅ **SECURITY FIX**: Removed user's ability to choose their own access level when adding a shared document
2. ✅ Access level is now determined by the document owner's share code settings only
3. ✅ Updated document service to not send accessLevel parameter (backend determines it)
4. ✅ Editor component checks access level and disables editing for View-only documents
5. ✅ View-only indicator badge displayed in the editor toolbar
6. ✅ Textarea becomes readonly when access level is "View"
7. ✅ Access level displayed in the dashboard for shared documents
8. ✅ Default access level selector in share modal (owner sets what access level new users get)
9. ✅ Ability to change access level for existing shared users directly from the share modal
10. ✅ Visual badges showing current access level (View/Edit) for each shared user
11. ✅ Service method to update shared access levels via API

## Testing Checklist

After implementing backend changes:

- [ ] Test adding a shared document with "View" access level
- [ ] Test adding a shared document with "Edit" access level
- [ ] Verify view-only documents cannot be edited in the editor
- [ ] Verify edit access documents can be edited
- [ ] Test that update endpoints reject requests from users with View-only access
- [ ] Verify document owner always has edit access

## Access Level Values

- **"View"**: User can only read the document (default)
- **"Edit"**: User can read and modify the document
