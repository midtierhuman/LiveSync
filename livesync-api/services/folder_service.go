package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/livesync/livesync-api/database"
	"github.com/livesync/livesync-api/models"
)

type FolderService struct {
	db              *database.DB
	documentService *DocumentService
	aclCache        ACLEngine
	auditService    *AuditService
}

func NewFolderService(db *database.DB, documentService *DocumentService) *FolderService {
	return &FolderService{
		db:              db,
		documentService: documentService,
	}
}

func (s *FolderService) SetACLCache(acl ACLEngine) {
	s.aclCache = acl
}

func (s *FolderService) SetAuditService(audit *AuditService) {
	s.auditService = audit
}

func (s *FolderService) Create(ctx context.Context, userId string, req *models.CreateFolderRequest) (*models.FolderDto, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("folder name is required")
	}

	if req.ParentFolderID != nil && strings.TrimSpace(*req.ParentFolderID) != "" {
		parentAccess, err := s.GetAccessLevel(ctx, *req.ParentFolderID, userId)
		if err != nil || parentAccess != "Edit" {
			return nil, errors.New("no edit access to parent folder")
		}
	}

	now := time.Now()
	id := uuid.New().String()
	shareCode := s.generateUniqueShareCode(ctx)

	query := `
		INSERT INTO "Folders" ("Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt")
		VALUES ($1, $2, $3, $4, $5, 'View', $6, $7);
	`
	_, err := s.db.Pool.Exec(ctx, query, id, name, userId, req.ParentFolderID, shareCode, now, now)
	if err != nil {
		return nil, err
	}

	folder := &models.Folder{
		ID:                 id,
		Name:               name,
		OwnerID:            userId,
		ParentFolderID:     req.ParentFolderID,
		ShareCode:          &shareCode,
		DefaultAccessLevel: "View",
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	return s.toDto(ctx, folder, false, userId)
}

func (s *FolderService) Owned(ctx context.Context, userId string) ([]models.FolderDto, error) {
	query := `
		SELECT "Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt"
		FROM "Folders"
		WHERE "OwnerId" = $1 AND "ParentFolderId" IS NULL
		ORDER BY "UpdatedAt" DESC;
	`
	rows, err := s.db.Pool.Query(ctx, query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.FolderDto
	for rows.Next() {
		var f models.Folder
		if err := rows.Scan(
			&f.ID, &f.Name, &f.OwnerID, &f.ParentFolderID, &f.ShareCode, &f.DefaultAccessLevel, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		dto, err := s.toDto(ctx, &f, true, userId)
		if err != nil {
			return nil, err
		}
		result = append(result, *dto)
	}

	if result == nil {
		result = []models.FolderDto{}
	}
	return result, nil
}

func (s *FolderService) Shared(ctx context.Context, userId string) ([]models.SharedFolderDto, error) {
	query := `
		SELECT sf."Id", sf."FolderId", sf."UserId", sf."AccessLevel", sf."SharedAt",
		       f."Name", f."OwnerId", u."Email"
		FROM "SharedFolders" sf
		JOIN "Folders" f ON sf."FolderId" = f."Id"
		LEFT JOIN "AspNetUsers" u ON f."OwnerId" = u."Id"
		WHERE sf."UserId" = $1
		ORDER BY sf."SharedAt" DESC;
	`
	rows, err := s.db.Pool.Query(ctx, query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.SharedFolderDto
	for rows.Next() {
		var (
			sf         models.SharedFolder
			folderName string
			ownerId    string
			ownerEmail *string
		)
		if err := rows.Scan(
			&sf.ID, &sf.FolderID, &sf.UserID, &sf.AccessLevel, &sf.SharedAt,
			&folderName, &ownerId, &ownerEmail,
		); err != nil {
			return nil, err
		}

		oEmail := ""
		if ownerEmail != nil {
			oEmail = *ownerEmail
		}

		path := s.BuildFolderPath(ctx, sf.FolderID)
		var pathIds, pathNames []string
		for _, node := range path {
			pathIds = append(pathIds, node.ID)
			pathNames = append(pathNames, node.Name)
		}

		result = append(result, models.SharedFolderDto{
			ID:          sf.ID,
			FolderID:    sf.FolderID,
			FolderName:  folderName,
			OwnerID:     ownerId,
			OwnerEmail:  oEmail,
			SharedAt:    sf.SharedAt,
			AccessLevel: sf.AccessLevel,
			PathIDs:     pathIds,
			PathNames:   pathNames,
		})
	}

	if result == nil {
		result = []models.SharedFolderDto{}
	}
	return result, nil
}

func (s *FolderService) SharedFolderDetails(ctx context.Context, userId string) ([]models.FolderDto, error) {
	query := `
		SELECT f."Id", f."Name", f."OwnerId", f."ParentFolderId", f."ShareCode", f."DefaultAccessLevel", f."CreatedAt", f."UpdatedAt"
		FROM "SharedFolders" sf
		JOIN "Folders" f ON sf."FolderId" = f."Id"
		WHERE sf."UserId" = $1
		ORDER BY sf."SharedAt" DESC;
	`
	rows, err := s.db.Pool.Query(ctx, query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.FolderDto
	for rows.Next() {
		var f models.Folder
		if err := rows.Scan(
			&f.ID, &f.Name, &f.OwnerID, &f.ParentFolderID, &f.ShareCode, &f.DefaultAccessLevel, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		dto, err := s.toDtoWithContents(ctx, &f, userId)
		if err != nil {
			return nil, err
		}
		result = append(result, *dto)
	}

	if result == nil {
		result = []models.FolderDto{}
	}
	return result, nil
}

func (s *FolderService) ByShareCode(ctx context.Context, code string) (*models.FolderDto, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, nil
	}

	query := `
		SELECT "Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt"
		FROM "Folders"
		WHERE "ShareCode" = $1
		LIMIT 1;
	`
	var f models.Folder
	err := s.db.Pool.QueryRow(ctx, query, code).Scan(
		&f.ID, &f.Name, &f.OwnerID, &f.ParentFolderID, &f.ShareCode, &f.DefaultAccessLevel, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return s.toDtoWithContents(ctx, &f, f.OwnerID)
}

func (s *FolderService) GenerateShareCode(ctx context.Context, id, userId string) (*models.FolderDto, error) {
	f, err := s.getRawFolder(ctx, id)
	if err != nil {
		return nil, err
	}
	if f.OwnerID != userId {
		return nil, errors.New("forbidden")
	}

	shareCode := s.generateUniqueShareCode(ctx)
	f.ShareCode = &shareCode
	f.UpdatedAt = time.Now()

	_, err = s.db.Pool.Exec(ctx, `UPDATE "Folders" SET "ShareCode" = $1, "UpdatedAt" = $2 WHERE "Id" = $3;`, shareCode, f.UpdatedAt, id)
	if err != nil {
		return nil, err
	}

	return s.toDto(ctx, f, true, userId)
}

func (s *FolderService) Find(ctx context.Context, folderId, userId string) (*models.FolderDto, error) {
	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	access, err := s.GetAccessLevel(ctx, folderId, userId)
	if err != nil || access == "" {
		return nil, nil
	}

	return s.toDtoWithContents(ctx, f, userId)
}

func (s *FolderService) Update(ctx context.Context, folderId, userId string, req *models.UpdateFolderRequest) (*models.FolderDto, error) {
	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		return nil, err
	}

	access, err := s.GetAccessLevel(ctx, folderId, userId)
	if err != nil || access != "Edit" {
		return nil, errors.New("forbidden")
	}

	f.Name = strings.TrimSpace(req.Name)
	f.UpdatedAt = time.Now()

	_, err = s.db.Pool.Exec(ctx, `UPDATE "Folders" SET "Name" = $1, "UpdatedAt" = $2 WHERE "Id" = $3;`, f.Name, f.UpdatedAt, folderId)
	if err != nil {
		return nil, err
	}

	return s.toDto(ctx, f, false, userId)
}

func (s *FolderService) Delete(ctx context.Context, folderId, userId string) (bool, error) {
	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	if f.OwnerID != userId {
		return false, errors.New("forbidden")
	}

	// Clean up direct shares on this folder first
	_, _ = s.db.Pool.Exec(ctx, `DELETE FROM "SharedFolders" WHERE "FolderId" = $1;`, folderId)

	// Recursively delete all contents and subfolders
	s.deleteContentsRecursively(ctx, folderId)

	tag, err := s.db.Pool.Exec(ctx, `DELETE FROM "Folders" WHERE "Id" = $1 AND "OwnerId" = $2;`, folderId, userId)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.InvalidateAllFolderAccess(ctx, folderId)
	}
	return tag.RowsAffected() > 0, nil
}

func (s *FolderService) deleteContentsRecursively(ctx context.Context, parentFolderId string) {
	// Find and delete documents in this folder and their shares
	rows, err := s.db.Pool.Query(ctx, `SELECT "Id" FROM "Documents" WHERE "FolderId" = $1;`, parentFolderId)
	if err == nil {
		var docIds []string
		for rows.Next() {
			var dId string
			_ = rows.Scan(&dId)
			docIds = append(docIds, dId)
		}
		rows.Close()

		for _, dId := range docIds {
			_, _ = s.db.Pool.Exec(ctx, `DELETE FROM "SharedDocuments" WHERE "DocumentId" = $1;`, dId)
			_, _ = s.db.Pool.Exec(ctx, `DELETE FROM "Documents" WHERE "Id" = $1;`, dId)
		}
	}

	// Recurse into child folders
	childRows, err := s.db.Pool.Query(ctx, `SELECT "Id" FROM "Folders" WHERE "ParentFolderId" = $1;`, parentFolderId)
	if err == nil {
		var childFolderIds []string
		for childRows.Next() {
			var cfId string
			_ = childRows.Scan(&cfId)
			childFolderIds = append(childFolderIds, cfId)
		}
		childRows.Close()

		for _, cfId := range childFolderIds {
			_, _ = s.db.Pool.Exec(ctx, `DELETE FROM "SharedFolders" WHERE "FolderId" = $1;`, cfId)
			s.deleteContentsRecursively(ctx, cfId)
			_, _ = s.db.Pool.Exec(ctx, `DELETE FROM "Folders" WHERE "Id" = $1;`, cfId)
		}
	}
}

func (s *FolderService) MoveDocument(ctx context.Context, documentId, userId string, targetFolderId *string) (bool, error) {
	canEdit, err := s.documentService.CanEdit(ctx, documentId, userId)
	if err != nil || !canEdit {
		return false, errors.New("forbidden")
	}

	if targetFolderId != nil && strings.TrimSpace(*targetFolderId) != "" {
		tAccess, err := s.GetAccessLevel(ctx, *targetFolderId, userId)
		if err != nil || tAccess != "Edit" {
			return false, errors.New("target folder not editable")
		}
	}

	now := time.Now()
	tag, err := s.db.Pool.Exec(ctx, `UPDATE "Documents" SET "FolderId" = $1, "UpdatedAt" = $2 WHERE "Id" = $3;`, targetFolderId, now, documentId)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *FolderService) MoveFolder(ctx context.Context, folderId, userId string, targetParentFolderId *string) (bool, error) {
	access, err := s.GetAccessLevel(ctx, folderId, userId)
	if err != nil || access != "Edit" {
		return false, errors.New("forbidden")
	}

	// Prevent moving folder into itself
	if targetParentFolderId != nil && *targetParentFolderId == folderId {
		return false, errors.New("cannot move folder into itself")
	}

	// Prevent circular hierarchy
	if targetParentFolderId != nil && strings.TrimSpace(*targetParentFolderId) != "" {
		descendantIds := s.collectSubfolderIds(ctx, folderId)
		for _, did := range descendantIds {
			if did == *targetParentFolderId {
				return false, errors.New("cannot move folder into its own descendant")
			}
		}

		tAccess, err := s.GetAccessLevel(ctx, *targetParentFolderId, userId)
		if err != nil || tAccess != "Edit" {
			return false, errors.New("target folder not editable")
		}
	}

	now := time.Now()
	tag, err := s.db.Pool.Exec(ctx, `UPDATE "Folders" SET "ParentFolderId" = $1, "UpdatedAt" = $2 WHERE "Id" = $3;`, targetParentFolderId, now, folderId)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *FolderService) AddFolderShare(ctx context.Context, shareCode, userId string) (bool, error) {
	shareCode = strings.ToUpper(strings.TrimSpace(shareCode))
	if shareCode == "" {
		return false, nil
	}

	f, err := s.ByShareCode(ctx, shareCode)
	if err != nil || f == nil {
		return false, nil
	}

	if f.OwnerID == userId {
		return true, nil // Owner already has access
	}

	var alreadyShared bool
	_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "SharedFolders" WHERE "FolderId" = $1 AND "UserId" = $2);`, f.ID, userId).Scan(&alreadyShared)
	if alreadyShared {
		return true, nil
	}

	shareID := uuid.New().String()
	now := time.Now()
	accessLevel := f.DefaultAccessLevel
	if accessLevel == "" {
		accessLevel = "View"
	}

	query := `
		INSERT INTO "SharedFolders" ("Id", "FolderId", "UserId", "AccessLevel", "SharedAt")
		VALUES ($1, $2, $3, $4, $5);
	`
	_, err = s.db.Pool.Exec(ctx, query, shareID, f.ID, userId, accessLevel, now)
	if err == nil && s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			ProjectId:  &f.ID,
			UserId:     userId,
			ActionType: "COLLABORATOR_JOINED",
			Details:    "Collaborator joined project with access: " + accessLevel,
		})
	}
	return err == nil, err
}

func (s *FolderService) GetAccessLevel(ctx context.Context, folderId, userId string) (string, error) {
	if folderId == "" {
		return "", nil
	}
	if s.aclCache != nil && userId != "" {
		if cached, hit, err := s.aclCache.GetFolderAccess(ctx, folderId, userId); err == nil && hit {
			if cached == "None" {
				return "", nil
			}
			return cached, nil
		}
	}

	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if s.aclCache != nil && userId != "" {
				_ = s.aclCache.SetFolderAccess(ctx, folderId, userId, "None", DefaultACLCacheTTL)
			}
			return "", nil
		}
		return "", err
	}

	perm := s.accessLevel(ctx, f, userId)
	if s.aclCache != nil && userId != "" {
		if perm != "" {
			_ = s.aclCache.SetFolderAccess(ctx, folderId, userId, perm, DefaultACLCacheTTL)
		} else {
			_ = s.aclCache.SetFolderAccess(ctx, folderId, userId, "None", DefaultACLCacheTTL)
		}
	}

	return perm, nil
}

func (s *FolderService) accessLevel(ctx context.Context, f *models.Folder, userId string) string {
	if f == nil {
		return ""
	}
	if f.OwnerID == userId {
		return "Edit"
	}

	var accessLevel string
	err := s.db.Pool.QueryRow(ctx, `SELECT "AccessLevel" FROM "SharedFolders" WHERE "FolderId" = $1 AND "UserId" = $2;`, f.ID, userId).Scan(&accessLevel)
	if err == nil && accessLevel != "" {
		return accessLevel
	}

	// Recursively check parent folder
	if f.ParentFolderID != nil && *f.ParentFolderID != "" {
		parent, err := s.getRawFolder(ctx, *f.ParentFolderID)
		if err == nil {
			return s.accessLevel(ctx, parent, userId)
		}
	}

	return ""
}

func (s *FolderService) BuildFolderPath(ctx context.Context, folderId string) []models.FolderPathNode {
	var path []models.FolderPathNode
	visited := make(map[string]bool)
	curr := folderId
	for curr != "" && !visited[curr] {
		visited[curr] = true
		f, err := s.getRawFolder(ctx, curr)
		if err != nil {
			break
		}
		path = append([]models.FolderPathNode{{ID: f.ID, Name: f.Name}}, path...)
		if f.ParentFolderID != nil {
			curr = *f.ParentFolderID
		} else {
			break
		}
	}
	return path
}

func (s *FolderService) collectSubfolderIds(ctx context.Context, parentId string) []string {
	var ids []string
	rows, err := s.db.Pool.Query(ctx, `SELECT "Id" FROM "Folders" WHERE "ParentFolderId" = $1;`, parentId)
	if err == nil {
		defer rows.Close()
		var childIds []string
		for rows.Next() {
			var id string
			_ = rows.Scan(&id)
			childIds = append(childIds, id)
		}
		for _, cid := range childIds {
			ids = append(ids, cid)
			ids = append(ids, s.collectSubfolderIds(ctx, cid)...)
		}
	}
	return ids
}

func (s *FolderService) getRawFolder(ctx context.Context, id string) (*models.Folder, error) {
	query := `
		SELECT "Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt"
		FROM "Folders"
		WHERE "Id" = $1;
	`
	var f models.Folder
	err := s.db.Pool.QueryRow(ctx, query, id).Scan(
		&f.ID, &f.Name, &f.OwnerID, &f.ParentFolderID, &f.ShareCode, &f.DefaultAccessLevel, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *FolderService) UpdateCodeAccess(ctx context.Context, folderId, userId, accessLevel string) (bool, error) {
	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		return false, err
	}
	if f.OwnerID != userId {
		return false, errors.New("only owner can modify share code access")
	}

	result, err := s.db.Pool.Exec(ctx, `UPDATE "Folders" SET "DefaultAccessLevel" = $1, "UpdatedAt" = $2 WHERE "Id" = $3;`, accessLevel, time.Now(), folderId)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.InvalidateAllFolderAccess(ctx, folderId)
	}
	return result.RowsAffected() > 0, nil
}

func (s *FolderService) RemoveShare(ctx context.Context, folderId, userId, targetUserId string) (bool, error) {
	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		return false, err
	}
	if f.OwnerID != userId && userId != targetUserId && !s.isAncestorFolderOwner(ctx, f.ParentFolderID, userId) {
		return false, errors.New("unauthorized to remove share")
	}

	result, err := s.db.Pool.Exec(ctx, `DELETE FROM "SharedFolders" WHERE "FolderId" = $1 AND "UserId" = $2;`, folderId, targetUserId)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.InvalidateFolderAccess(ctx, folderId, targetUserId)
	}
	if s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			ProjectId:  &folderId,
			UserId:     userId,
			TargetUser: targetUserId,
			ActionType: "COLLABORATOR_REMOVED",
			Details:    "Collaborator access revoked from project",
		})
	}
	return result.RowsAffected() > 0, nil
}

func (s *FolderService) UpdateShareAccess(ctx context.Context, folderId, userId, targetUserId, accessLevel string) (bool, error) {
	if accessLevel != "View" && accessLevel != "Edit" {
		return false, errors.New("invalid access level")
	}
	f, err := s.getRawFolder(ctx, folderId)
	if err != nil {
		return false, err
	}
	if f.OwnerID != userId && !s.isAncestorFolderOwner(ctx, f.ParentFolderID, userId) {
		return false, errors.New("only owner can modify collaborator permissions")
	}

	shareID := uuid.New().String()
	result, err := s.db.Pool.Exec(ctx, `
		INSERT INTO "SharedFolders" ("Id", "FolderId", "UserId", "AccessLevel", "SharedAt")
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT ("FolderId", "UserId")
		DO UPDATE SET "AccessLevel" = EXCLUDED."AccessLevel";
	`, shareID, folderId, targetUserId, accessLevel)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.SetFolderAccess(ctx, folderId, targetUserId, accessLevel, DefaultACLCacheTTL)
	}
	if s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			ProjectId:  &folderId,
			UserId:     userId,
			TargetUser: targetUserId,
			ActionType: "PERMISSION_UPDATED",
			Details:    "Collaborator permission set to " + accessLevel,
		})
	}
	return result.RowsAffected() > 0, nil
}

func (s *FolderService) isAncestorFolderOwner(ctx context.Context, parentId *string, userId string) bool {
	curr := parentId
	for curr != nil && *curr != "" {
		var ownerId string
		var nextParent *string
		err := s.db.Pool.QueryRow(ctx, `SELECT "OwnerId", "ParentFolderId" FROM "Folders" WHERE "Id" = $1;`, *curr).Scan(&ownerId, &nextParent)
		if err != nil {
			break
		}
		if ownerId == userId {
			return true
		}
		curr = nextParent
	}
	return false
}

func (s *FolderService) toDto(ctx context.Context, f *models.Folder, includeSubfolders bool, viewerUserId string) (*models.FolderDto, error) {
	var subfolders []models.FolderDto
	if includeSubfolders {
		rows, err := s.db.Pool.Query(ctx, `
			SELECT "Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt"
			FROM "Folders" WHERE "ParentFolderId" = $1 ORDER BY "UpdatedAt" DESC;
		`, f.ID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var sf models.Folder
				_ = rows.Scan(&sf.ID, &sf.Name, &sf.OwnerID, &sf.ParentFolderID, &sf.ShareCode, &sf.DefaultAccessLevel, &sf.CreatedAt, &sf.UpdatedAt)
				dto, _ := s.toDto(ctx, &sf, true, viewerUserId)
				if dto != nil {
					subfolders = append(subfolders, *dto)
				}
			}
		}
	}
	if subfolders == nil {
		subfolders = []models.FolderDto{}
	}

	var docCount int
	_ = s.db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM "Documents" WHERE "FolderId" = $1;`, f.ID).Scan(&docCount)

	isShared := viewerUserId != "" && f.OwnerID != viewerUserId
	permission := "Edit"
	if isShared {
		perm := s.accessLevel(ctx, f, viewerUserId)
		if perm != "" {
			permission = perm
		} else {
			permission = "View"
		}
	}

	var sharedWith []models.SharedFolderUserDto
	sharedRows, err := s.db.Pool.Query(ctx, `
		SELECT sf."Id", sf."FolderId", sf."UserId", sf."AccessLevel", sf."SharedAt", COALESCE(u."UserName", 'Unknown')
		FROM "SharedFolders" sf
		LEFT JOIN "AspNetUsers" u ON sf."UserId" = u."Id"
		WHERE sf."FolderId" = $1
		ORDER BY sf."SharedAt" DESC;
	`, f.ID)
	if err == nil {
		defer sharedRows.Close()
		for sharedRows.Next() {
			var su models.SharedFolderUserDto
			if err := sharedRows.Scan(&su.ID, &su.FolderID, &su.UserID, &su.AccessLevel, &su.SharedAt, &su.UserName); err == nil {
				sharedWith = append(sharedWith, su)
			}
		}
	}
	if sharedWith == nil {
		sharedWith = []models.SharedFolderUserDto{}
	}

	return &models.FolderDto{
		ID:                 f.ID,
		Name:               f.Name,
		OwnerID:            f.OwnerID,
		ParentFolderID:     f.ParentFolderID,
		ShareCode:          f.ShareCode,
		DefaultAccessLevel: f.DefaultAccessLevel,
		CreatedAt:          f.CreatedAt,
		UpdatedAt:          f.UpdatedAt,
		SubfoldersCount:    len(subfolders),
		DocumentsCount:     docCount,
		Subfolders:         subfolders,
		Documents:          []models.DocumentDto{},
		FolderPath:         []models.FolderPathNode{},
		SharedWith:         sharedWith,
		IsShared:           isShared,
		Permission:         permission,
	}, nil
}

func (s *FolderService) toDtoWithContents(ctx context.Context, f *models.Folder, viewerUserId string) (*models.FolderDto, error) {
	// Subfolders
	var subfolders []models.FolderDto
	subRows, err := s.db.Pool.Query(ctx, `
		SELECT "Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt"
		FROM "Folders" WHERE "ParentFolderId" = $1 ORDER BY "UpdatedAt" DESC;
	`, f.ID)
	if err == nil {
		defer subRows.Close()
		for subRows.Next() {
			var sf models.Folder
			_ = subRows.Scan(&sf.ID, &sf.Name, &sf.OwnerID, &sf.ParentFolderID, &sf.ShareCode, &sf.DefaultAccessLevel, &sf.CreatedAt, &sf.UpdatedAt)
			dto, _ := s.toDto(ctx, &sf, true, viewerUserId)
			if dto != nil {
				subfolders = append(subfolders, *dto)
			}
		}
	}
	if subfolders == nil {
		subfolders = []models.FolderDto{}
	}

	// Documents
	var documents []models.DocumentDto
	docRows, err := s.db.Pool.Query(ctx, `
		SELECT "Id", "Title", "Content", "OwnerId", "FolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt", "LastEditedAt", "LastEditedBy"
		FROM "Documents" WHERE "FolderId" = $1 ORDER BY "UpdatedAt" DESC;
	`, f.ID)
	if err == nil {
		defer docRows.Close()
		for docRows.Next() {
			var doc models.Document
			_ = docRows.Scan(&doc.ID, &doc.Title, &doc.Content, &doc.OwnerID, &doc.FolderID, &doc.ShareCode, &doc.DefaultAccessLevel, &doc.CreatedAt, &doc.UpdatedAt, &doc.LastEditedAt, &doc.LastEditedBy)
			dto, _ := s.documentService.toDto(ctx, &doc, viewerUserId)
			if dto != nil {
				documents = append(documents, *dto)
			}
		}
	}
	if documents == nil {
		documents = []models.DocumentDto{}
	}

	isShared := viewerUserId != "" && f.OwnerID != viewerUserId
	permission := "Edit"
	if isShared {
		perm := s.accessLevel(ctx, f, viewerUserId)
		if perm != "" {
			permission = perm
		} else {
			permission = "View"
		}
	}

	var sharedWith []models.SharedFolderUserDto
	sharedRows, err := s.db.Pool.Query(ctx, `
		SELECT sf."Id", sf."FolderId", sf."UserId", sf."AccessLevel", sf."SharedAt", COALESCE(u."UserName", 'Unknown')
		FROM "SharedFolders" sf
		LEFT JOIN "AspNetUsers" u ON sf."UserId" = u."Id"
		WHERE sf."FolderId" = $1
		ORDER BY sf."SharedAt" DESC;
	`, f.ID)
	if err == nil {
		defer sharedRows.Close()
		for sharedRows.Next() {
			var su models.SharedFolderUserDto
			if err := sharedRows.Scan(&su.ID, &su.FolderID, &su.UserID, &su.AccessLevel, &su.SharedAt, &su.UserName); err == nil {
				sharedWith = append(sharedWith, su)
			}
		}
	}
	if sharedWith == nil {
		sharedWith = []models.SharedFolderUserDto{}
	}

	return &models.FolderDto{
		ID:                 f.ID,
		Name:               f.Name,
		OwnerID:            f.OwnerID,
		ParentFolderID:     f.ParentFolderID,
		ShareCode:          f.ShareCode,
		DefaultAccessLevel: f.DefaultAccessLevel,
		CreatedAt:          f.CreatedAt,
		UpdatedAt:          f.UpdatedAt,
		SubfoldersCount:    len(subfolders),
		DocumentsCount:     len(documents),
		Subfolders:         subfolders,
		Documents:          documents,
		FolderPath:         s.BuildFolderPath(ctx, f.ID),
		SharedWith:         sharedWith,
		IsShared:           isShared,
		Permission:         permission,
	}, nil
}

func (s *FolderService) generateUniqueShareCode(ctx context.Context) string {
	for {
		code := generateRandomCode(10)
		var existsDoc, existsFolder bool
		_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Documents" WHERE "ShareCode" = $1);`, code).Scan(&existsDoc)
		_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Folders" WHERE "ShareCode" = $1);`, code).Scan(&existsFolder)
		if !existsDoc && !existsFolder {
			return code
		}
	}
}
