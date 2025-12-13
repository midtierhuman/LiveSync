# Testing Guide - Access Level Control

## Prerequisites
- Ensure the database migration has been applied
- Have at least 2 user accounts for testing (owner and collaborator)
- Start the LiveSync.Api service

## Test Scenarios

### Scenario 1: Document Owner Sets Default Access Level

#### Steps:
1. **Login as User A (Document Owner)**
2. **Create a new document**
   - POST `/api/documents`
   - Verify document is created with `DefaultAccessLevel: "View"`

3. **Generate a share code**
   - POST `/api/documents/{documentId}/generate-share-code`
   - Note the share code

4. **Update share code access level to "Edit"**
   - PUT `/api/documents/{documentId}/share-code-access-level`
   - Body: `{ "accessLevel": "Edit" }`
   - Verify response: 200 OK

5. **Verify the change**
   - GET `/api/documents/{documentId}`
   - Confirm `DefaultAccessLevel: "Edit"`

### Scenario 2: User Adds Shared Document with View Access

#### Steps:
1. **As User A, set share code access level to "View"**
   - PUT `/api/documents/{documentId}/share-code-access-level`
   - Body: `{ "accessLevel": "View" }`

2. **Login as User B (Collaborator)**
3. **Add the shared document**
   - POST `/api/documents/add-shared`
   - Body: `{ "shareCode": "ABC12345" }`
   - Verify response: 200 OK

4. **Check shared documents list**
   - GET `/api/documents/shared-with-me`
   - Verify document appears with `AccessLevel: "View"`

5. **Try to edit the document (should fail)**
   - PUT `/api/documents/{documentId}`
   - Body: `{ "content": "Modified content" }`
   - Expected: 403 Forbidden

6. **Try to update content (should fail)**
   - PUT `/api/documents/{documentId}/content`
   - Body: `{ "content": "Modified content" }`
   - Expected: 403 Forbidden

### Scenario 3: User Adds Shared Document with Edit Access

#### Steps:
1. **As User A, set share code access level to "Edit"**
   - PUT `/api/documents/{documentId}/share-code-access-level`
   - Body: `{ "accessLevel": "Edit" }`

2. **As User A, remove User B's existing access**
   - DELETE `/api/documents/{documentId}/shared/{userBId}`

3. **Login as User B**
4. **Add the shared document again**
   - POST `/api/documents/add-shared`
   - Body: `{ "shareCode": "ABC12345" }`

5. **Check shared documents list**
   - GET `/api/documents/shared-with-me`
   - Verify document appears with `AccessLevel: "Edit"`

6. **Edit the document (should succeed)**
   - PUT `/api/documents/{documentId}`
   - Body: `{ "content": "Modified content" }`
   - Expected: 200 OK

### Scenario 4: Owner Changes Individual User Access Level

#### Steps:
1. **Login as User A (Document Owner)**
2. **Change User B's access from Edit to View**
   - PUT `/api/documents/{documentId}/shared/{userBId}/access-level`
   - Body: `{ "accessLevel": "View" }`
   - Expected: 200 OK

3. **Login as User B**
4. **Try to edit the document (should now fail)**
   - PUT `/api/documents/{documentId}`
   - Body: `{ "content": "Modified content" }`
   - Expected: 403 Forbidden

5. **Login as User A**
6. **Change User B's access from View to Edit**
   - PUT `/api/documents/{documentId}/shared/{userBId}/access-level`
   - Body: `{ "accessLevel": "Edit" }`

7. **Login as User B**
8. **Edit the document (should now succeed)**
   - PUT `/api/documents/{documentId}`
   - Body: `{ "content": "Modified content again" }`
   - Expected: 200 OK

### Scenario 5: Security Tests

#### Test 5.1: Non-owner cannot change share code access level
1. **Login as User B (Collaborator)**
2. **Try to update share code access level**
   - PUT `/api/documents/{documentId}/share-code-access-level`
   - Body: `{ "accessLevel": "Edit" }`
   - Expected: 404 Not Found (service validates ownership)

#### Test 5.2: Non-owner cannot change individual access levels
1. **Login as User B (Collaborator)**
2. **Try to change another user's access level**
   - PUT `/api/documents/{documentId}/shared/{userCId}/access-level`
   - Body: `{ "accessLevel": "Edit" }`
   - Expected: 403 Forbidden

#### Test 5.3: Invalid access level values
1. **Login as User A (Owner)**
2. **Try to set invalid access level**
   - PUT `/api/documents/{documentId}/share-code-access-level`
   - Body: `{ "accessLevel": "Admin" }`
   - Expected: 400 Bad Request

### Scenario 6: Existing Documents

#### Steps:
1. **Query existing documents (created before migration)**
2. **Verify they have DefaultAccessLevel: "View"**
   - GET `/api/documents/{documentId}`
   - Confirm `DefaultAccessLevel: "View"` (set by migration)

## Expected Behavior Summary

### AddSharedDocument Endpoint
- ? Accepts only `shareCode` in request body
- ? Uses document's `DefaultAccessLevel` for new shared access
- ? Returns 400 if share code is invalid
- ? Returns 400 if user already has access

### UpdateShareCodeAccessLevel Endpoint
- ? Only document owner can update
- ? Returns 404 if user is not owner
- ? Validates access level ("View" or "Edit")
- ? Returns 400 for invalid access levels

### UpdateDocument & UpdateContent Endpoints
- ? Check `HasEditAccess` before allowing updates
- ? Return 403 Forbidden if user only has View access
- ? Allow updates if user is owner or has Edit access

### UpdateSharedAccessLevel Endpoint
- ? Only document owner can update individual user access levels
- ? Returns 403 if requestor is not owner
- ? Validates access level values
- ? Updates specific user's access level (not share code default)

## Swagger Testing

### Using Swagger UI
1. Navigate to `https://localhost:7001/swagger`
2. Click "Authorize" and enter your JWT token
3. Use the endpoints under "Documents" section
4. Test the scenarios above

### Sample JWT Token Flow
1. POST `/api/auth/register` or `/api/auth/login`
2. Copy the `token` from response
3. Click "Authorize" in Swagger
4. Enter: `Bearer {your-token}`
5. Test protected endpoints

## Common Issues

### Issue: 403 Forbidden on edit
**Cause**: User only has View access
**Solution**: Owner needs to update access level to Edit

### Issue: 404 on UpdateShareCodeAccessLevel
**Cause**: User is not the document owner
**Solution**: Authenticate as document owner

### Issue: Migration not applied
**Symptom**: Column 'DefaultAccessLevel' doesn't exist
**Solution**: Run `dotnet ef database update` in LiveSync.Api directory

## Success Criteria

? View-only users cannot edit documents
? Edit users can modify documents
? Document owners can change share code default access level
? Document owners can change individual user access levels
? Non-owners cannot modify access levels
? Invalid access level values are rejected
? Existing documents have default access level "View"
