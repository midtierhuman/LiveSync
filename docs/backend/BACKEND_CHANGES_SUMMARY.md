# Backend Changes Summary - Access Level Control

## Overview
Successfully implemented backend support for access level control (View/Edit) for shared documents. The system now uses document-level default access levels instead of allowing users to choose their own access level when adding shared documents.

## Changes Implemented

### 1. DTO Updates (`DocumentDtos.java`)

#### AddSharedDocumentRequest
- **Removed**: `AccessLevel` property
- **Security Fix**: Users can no longer choose their own access level when adding a shared document
- The access level is now determined by the document owner's share code settings

#### DocumentDto
- **Added**: `DefaultAccessLevel` property
- This exposes the document's default access level for share codes to the frontend

### 2. Model Updates (`Document.java`)

#### Document Model
- **Added**: `DefaultAccessLevel` property with `[StringLength(50)]` attribute
- Default value: "View"
- Stores the access level that will be applied when users add the document via share code

### 3. Service Updates (`DocumentService.java`)

#### Updated Methods
- `addShare(String shareCode, String userId)` - uses the document default access level
- `updateCodeAccess(String documentId, String userId, String accessLevel)` - updates the share code default access level

### 4. Controller and Service Implementation Updates

#### Add Shared Document
- Now reads the `DefaultAccessLevel` from the document instead of accepting it as a parameter
- Uses document's default access level when creating new SharedDocument entries
- Security improvement: Access level is controlled by document owner, not by users adding the document

#### Update Share Code Access Level
- Allows document owners to update the default access level for their share codes
- Validates that the requesting user is the document owner
- Validates access level values ("View" or "Edit")

#### DTO mapping
- Updated to include `DefaultAccessLevel` in the mapping from Document to DocumentDto

### 5. Controller Updates (`DocumentsController.java`)

#### AddSharedDocument Endpoint
- Updated to call `AddSharedDocumentAsync` with only `shareCode` and `userId` parameters
- No longer passes `accessLevel` from the request body

#### UpdateShareCodeAccessLevel Endpoint (New)
- **Route**: `PUT /api/documents/{documentId}/share-code-access-level`
- **Authorization**: Document owner only
- **Purpose**: Allows document owners to change the default access level for share codes
- **Validates**: Access level must be "View" or "Edit"
- **Returns**: 200 OK on success, appropriate error codes for invalid requests

### 6. Database Schema

- `DefaultAccessLevel` is stored on the document record
- Existing documents default to `View`

## API Endpoints

### Modified Endpoints

#### POST /api/documents/add-shared
**Before:**
```json
{
  "shareCode": "ABC12345",
  "accessLevel": "View"  // ? Removed
}
```

**After:**
```json
{
  "shareCode": "ABC12345"
}
```

### New Endpoints

#### PUT /api/documents/{documentId}/share-code-access-level
**Request:**
```json
{
  "accessLevel": "Edit"
}
```

**Response (200 OK):**
```json
{
  "message": "Share code access level updated successfully"
}
```

**Error Responses:**
- 401 Unauthorized: User not authenticated
- 403 Forbidden: User is not the document owner
- 404 Not Found: Document not found
- 400 Bad Request: Invalid access level

## Security Improvements

1. **Removed User Control**: Users can no longer choose their own access level when adding shared documents
2. **Owner Control**: Only document owners can set and change the default access level for share codes
3. **Consistent Access**: All users who add a document via a specific share code get the same access level
4. **Validation**: Access levels are validated at multiple layers (controller and service)

## Testing Checklist

? Build successful
? Database migration applied successfully
? All interfaces and implementations updated consistently

### Manual Testing Required

- [ ] Test adding a shared document with "View" default access level
- [ ] Test adding a shared document with "Edit" default access level
- [ ] Verify view-only documents cannot be edited in the editor
- [ ] Verify edit access documents can be edited
- [ ] Test UpdateShareCodeAccessLevel endpoint as document owner
- [ ] Test that non-owners cannot update share code access level
- [ ] Verify document owner always has edit access
- [ ] Test updating individual shared user access levels (existing feature)

## Access Level Values

- **"View"**: User can only read the document (default)
- **"Edit"**: User can read and modify the document

## Frontend Integration

The frontend has already been updated to:
- Remove access level selection when adding shared documents
- Display default access level selector in share modal for document owners
- Show access level indicators in the UI
- Call the new `updateShareCodeAccessLevel` API endpoint
- Disable editing for view-only documents

## Files Modified

1. `backend/livesync/livesync-api/src/main/java/com/livesync/api/dto/DocumentDtos.java`
2. `backend/livesync/livesync-api/src/main/java/com/livesync/api/model/Document.java`
3. `backend/livesync/livesync-api/src/main/java/com/livesync/api/service/DocumentService.java`
4. `backend/livesync/livesync-api/src/main/java/com/livesync/api/controller/DocumentsController.java`

## Database Schema Change

```sql
ALTER TABLE [Documents] 
ADD [DefaultAccessLevel] nvarchar(50) NOT NULL DEFAULT N'View';
```

## Deployment Features

### Deployment Notes
The Java API expects the database schema to be present before startup.
Use the deployment guide to keep the schema and application in sync.

## Next Steps

1. Test all endpoints manually using Swagger or Postman
2. Verify frontend integration works correctly
3. Test real-time editing restrictions with view-only access
4. Deploy to testing environment (migrations will apply automatically)
5. Update API documentation if needed
6. Follow AWS deployment guide for production deployment
