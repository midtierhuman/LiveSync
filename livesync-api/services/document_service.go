package services

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/livesync/livesync-api/database"
	"github.com/livesync/livesync-api/models"
	"github.com/redis/go-redis/v9"
)

const ShareChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

type DocumentService struct {
	db           *database.DB
	rdb          *redis.Client
	aclCache     ACLEngine
	auditService *AuditService
}

func NewDocumentService(db *database.DB) *DocumentService {
	return &DocumentService{db: db}
}

func (s *DocumentService) SetRedisClient(rdb *redis.Client) {
	s.rdb = rdb
	if s.aclCache == nil && rdb != nil {
		s.aclCache = NewRedisACLCacheService(rdb)
	}
}

func (s *DocumentService) SetACLCache(acl ACLEngine) {
	s.aclCache = acl
}

func (s *DocumentService) SetAuditService(audit *AuditService) {
	s.auditService = audit
}

func (s *DocumentService) Find(ctx context.Context, id, userId string) (*models.DocumentDto, error) {
	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	access, err := s.Access(ctx, id, userId)
	if err != nil || access == "" {
		return nil, nil // Not accessible
	}

	return s.toDto(ctx, doc, userId)
}

func (s *DocumentService) Owned(ctx context.Context, userId string) ([]models.DocumentDto, error) {
	query := `
		SELECT "Id", "Title", "Content", "OwnerId", "FolderId", "ShareCode",
		       "DefaultAccessLevel", "CreatedAt", "UpdatedAt", "LastEditedAt", "LastEditedBy"
		FROM "Documents"
		WHERE "OwnerId" = $1
		ORDER BY "UpdatedAt" DESC;
	`
	rows, err := s.db.Pool.Query(ctx, query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.DocumentDto
	for rows.Next() {
		var doc models.Document
		if err := rows.Scan(
			&doc.ID, &doc.Title, &doc.Content, &doc.OwnerID, &doc.FolderID, &doc.ShareCode,
			&doc.DefaultAccessLevel, &doc.CreatedAt, &doc.UpdatedAt, &doc.LastEditedAt, &doc.LastEditedBy,
		); err != nil {
			return nil, err
		}
		dto, err := s.toDto(ctx, &doc, userId)
		if err != nil {
			return nil, err
		}
		result = append(result, *dto)
	}

	if result == nil {
		result = []models.DocumentDto{}
	}
	return result, nil
}

func (s *DocumentService) Shared(ctx context.Context, userId string) ([]models.SharedDocumentDto, error) {
	query := `
		SELECT sd."Id", sd."DocumentId", sd."UserId", sd."AccessLevel", sd."SharedAt",
		       d."Title", d."FolderId", u."UserName"
		FROM "SharedDocuments" sd
		JOIN "Documents" d ON sd."DocumentId" = d."Id"
		LEFT JOIN "AspNetUsers" u ON sd."UserId" = u."Id"
		WHERE sd."UserId" = $1
		ORDER BY sd."SharedAt" DESC;
	`
	rows, err := s.db.Pool.Query(ctx, query, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.SharedDocumentDto
	for rows.Next() {
		var (
			sd       models.SharedDocument
			docTitle string
			folderID *string
			userName *string
		)
		if err := rows.Scan(
			&sd.ID, &sd.DocumentID, &sd.UserID, &sd.AccessLevel, &sd.SharedAt,
			&docTitle, &folderID, &userName,
		); err != nil {
			return nil, err
		}

		uName := "Unknown"
		if userName != nil && *userName != "" {
			uName = *userName
		}

		folderPath := s.buildDocFolderPath(ctx, folderID)

		result = append(result, models.SharedDocumentDto{
			ID:            sd.ID,
			DocumentID:    sd.DocumentID,
			DocumentTitle: docTitle,
			UserID:        sd.UserID,
			UserName:      uName,
			SharedAt:      sd.SharedAt,
			AccessLevel:   sd.AccessLevel,
			FolderPath:    folderPath,
		})
	}

	if result == nil {
		result = []models.SharedDocumentDto{}
	}
	return result, nil
}

func (s *DocumentService) Create(ctx context.Context, userId string, req *models.CreateDocumentRequest) (*models.DocumentDto, error) {
	now := time.Now()
	id := uuid.New().String()
	title := strings.TrimSpace(req.Title)
	if err := ValidatePathAndName(title); err != nil {
		return nil, err
	}
	content := req.Content
	if err := ValidateContentSize(content); err != nil {
		return nil, err
	}

	var finalFolderId *string
	if req.FolderID != nil && strings.TrimSpace(*req.FolderID) != "" {
		targetId := strings.TrimSpace(*req.FolderID)
		perm, err := s.folderAccess(ctx, targetId, userId)
		if err != nil || perm != "Edit" {
			return nil, errors.New("forbidden: no edit access to target folder")
		}
		finalFolderId = &targetId
	} else {
		defaultFolderId, err := s.getOrCreateDefaultFolder(ctx, userId)
		if err != nil {
			return nil, err
		}
		finalFolderId = &defaultFolderId
	}

	if finalFolderId != nil {
		if err := ValidateProjectQuotas(ctx, s.db.Pool, *finalFolderId, len([]byte(content)), true); err != nil {
			return nil, err
		}
	}

	query := `
		INSERT INTO "Documents" (
			"Id", "Title", "Content", "OwnerId", "FolderId", "ShareCode",
			"DefaultAccessLevel", "CreatedAt", "UpdatedAt"
		) VALUES ($1, $2, $3, $4, $5, NULL, 'View', $6, $7);
	`
	_, err := s.db.Pool.Exec(ctx, query, id, title, content, userId, finalFolderId, now, now)
	if err != nil {
		return nil, err
	}

	doc := &models.Document{
		ID:                 id,
		Title:              title,
		Content:            content,
		OwnerID:            userId,
		FolderID:           finalFolderId,
		DefaultAccessLevel: "View",
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	return s.toDto(ctx, doc, userId)
}

func (s *DocumentService) getOrCreateDefaultFolder(ctx context.Context, userId string) (string, error) {
	var folderId string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT "Id" FROM "Folders" 
		WHERE "OwnerId" = $1 AND "ParentFolderId" IS NULL 
		ORDER BY "CreatedAt" ASC LIMIT 1;
	`, userId).Scan(&folderId)
	if err == nil && folderId != "" {
		return folderId, nil
	}

	now := time.Now()
	newId := uuid.New().String()
	shareCode := generateRandomCode(10)
	_, err = s.db.Pool.Exec(ctx, `
		INSERT INTO "Folders" ("Id", "Name", "OwnerId", "ParentFolderId", "ShareCode", "DefaultAccessLevel", "CreatedAt", "UpdatedAt")
		VALUES ($1, 'Main Project', $2, NULL, $3, 'View', $4, $5);
	`, newId, userId, shareCode, now, now)
	if err != nil {
		return "", err
	}
	return newId, nil
}

func (s *DocumentService) Update(ctx context.Context, id, userId string, req *models.UpdateDocumentRequest) (*models.DocumentDto, error) {
	canEdit, err := s.CanEdit(ctx, id, userId)
	if err != nil || !canEdit {
		return nil, errors.New("forbidden")
	}

	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	if req.Title != nil && strings.TrimSpace(*req.Title) != "" {
		newTitle := strings.TrimSpace(*req.Title)
		if err := ValidatePathAndName(newTitle); err != nil {
			return nil, err
		}
		doc.Title = newTitle
	}
	if req.Content != nil {
		if err := ValidateContentSize(*req.Content); err != nil {
			return nil, err
		}
		diffBytes := len([]byte(*req.Content)) - len([]byte(doc.Content))
		if diffBytes > 0 && doc.FolderID != nil {
			if err := ValidateProjectQuotas(ctx, s.db.Pool, *doc.FolderID, diffBytes, false); err != nil {
				return nil, err
			}
		}
		doc.Content = *req.Content
	}
	doc.UpdatedAt = now
	doc.LastEditedAt = &now
	lastEditor := userId
	if req.LastEditedBy != nil && strings.TrimSpace(*req.LastEditedBy) != "" {
		lastEditor = strings.TrimSpace(*req.LastEditedBy)
	}
	doc.LastEditedBy = &lastEditor

	query := `
		UPDATE "Documents"
		SET "Title" = $1, "Content" = $2, "UpdatedAt" = $3, "LastEditedAt" = $4, "LastEditedBy" = $5
		WHERE "Id" = $6;
	`
	_, err = s.db.Pool.Exec(ctx, query, doc.Title, doc.Content, doc.UpdatedAt, doc.LastEditedAt, doc.LastEditedBy, doc.ID)
	if err != nil {
		return nil, err
	}

	return s.toDto(ctx, doc, userId)
}

func (s *DocumentService) UpdateContent(ctx context.Context, id, userId string, req *models.DocumentContentUpdateRequest) (*models.DocumentDto, error) {
	canEdit, err := s.CanEdit(ctx, id, userId)
	if err != nil || !canEdit {
		return nil, errors.New("forbidden")
	}

	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	doc.Content = req.Content
	doc.UpdatedAt = now
	doc.LastEditedAt = &now
	lastEditor := userId
	if req.LastEditedBy != nil && strings.TrimSpace(*req.LastEditedBy) != "" {
		lastEditor = strings.TrimSpace(*req.LastEditedBy)
	}
	doc.LastEditedBy = &lastEditor

	query := `
		UPDATE "Documents"
		SET "Content" = $1, "UpdatedAt" = $2, "LastEditedAt" = $3, "LastEditedBy" = $4
		WHERE "Id" = $5;
	`
	_, err = s.db.Pool.Exec(ctx, query, doc.Content, doc.UpdatedAt, doc.LastEditedAt, doc.LastEditedBy, doc.ID)
	if err != nil {
		return nil, err
	}

	if s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			DocumentId: &doc.ID,
			ProjectId:  doc.FolderID,
			UserId:     userId,
			ActionType: "DOCUMENT_SAVED",
			Details:    "Saved document revision",
		})
	}

	return s.toDto(ctx, doc, userId)
}

func (s *DocumentService) UpdateContentInternal(ctx context.Context, id, content, userId string) (bool, error) {
	now := time.Now()
	lastEditor := "system"
	if strings.TrimSpace(userId) != "" {
		lastEditor = strings.TrimSpace(userId)
	}

	query := `
		UPDATE "Documents"
		SET "Content" = $1, "UpdatedAt" = $2, "LastEditedAt" = $3, "LastEditedBy" = $4
		WHERE "Id" = $5;
	`
	tag, err := s.db.Pool.Exec(ctx, query, content, now, now, lastEditor, id)
	if err != nil {
		return false, err
	}
	if s.auditService != nil && tag.RowsAffected() > 0 {
		var folderId *string
		_ = s.db.Pool.QueryRow(ctx, `SELECT "FolderId" FROM "Documents" WHERE "Id" = $1;`, id).Scan(&folderId)
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			DocumentId: &id,
			ProjectId:  folderId,
			UserId:     lastEditor,
			ActionType: "DOCUMENT_SAVED",
			Details:    "Write-behind stream snapshot saved",
		})
	}
	return tag.RowsAffected() > 0, nil
}

func (s *DocumentService) Delete(ctx context.Context, id, userId string) (bool, error) {
	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	if doc.OwnerID != userId {
		return false, errors.New("forbidden")
	}

	_, _ = s.db.Pool.Exec(ctx, `DELETE FROM "SharedDocuments" WHERE "DocumentId" = $1;`, id)
	tag, err := s.db.Pool.Exec(ctx, `DELETE FROM "Documents" WHERE "Id" = $1 AND "OwnerId" = $2;`, id, userId)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.InvalidateAllDocumentAccess(ctx, id)
	}
	return tag.RowsAffected() > 0, nil
}

func (s *DocumentService) GenerateShareCode(ctx context.Context, id, userId string) (*models.DocumentDto, error) {
	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		return nil, err
	}
	if doc.OwnerID != userId {
		return nil, errors.New("forbidden")
	}

	var code string
	for {
		code = generateRandomCode(10)
		var existsDoc, existsFolder bool
		_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Documents" WHERE "ShareCode" = $1);`, code).Scan(&existsDoc)
		_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Folders" WHERE "ShareCode" = $1);`, code).Scan(&existsFolder)
		if !existsDoc && !existsFolder {
			break
		}
	}

	doc.ShareCode = &code
	doc.UpdatedAt = time.Now()
	_, err = s.db.Pool.Exec(ctx, `UPDATE "Documents" SET "ShareCode" = $1, "UpdatedAt" = $2 WHERE "Id" = $3;`, code, doc.UpdatedAt, id)
	if err != nil {
		return nil, err
	}

	return s.toDto(ctx, doc, userId)
}

func (s *DocumentService) ByShareCode(ctx context.Context, code string) (*models.DocumentDto, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, nil
	}

	query := `
		SELECT "Id", "Title", "Content", "OwnerId", "FolderId", "ShareCode",
		       "DefaultAccessLevel", "CreatedAt", "UpdatedAt", "LastEditedAt", "LastEditedBy"
		FROM "Documents"
		WHERE "ShareCode" = $1
		LIMIT 1;
	`
	var doc models.Document
	err := s.db.Pool.QueryRow(ctx, query, code).Scan(
		&doc.ID, &doc.Title, &doc.Content, &doc.OwnerID, &doc.FolderID, &doc.ShareCode,
		&doc.DefaultAccessLevel, &doc.CreatedAt, &doc.UpdatedAt, &doc.LastEditedAt, &doc.LastEditedBy,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return s.toDto(ctx, &doc, doc.OwnerID)
}

func (s *DocumentService) AddShare(ctx context.Context, code, userId string) (bool, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return false, nil
	}

	doc, err := s.ByShareCode(ctx, code)
	if err != nil || doc == nil || doc.OwnerID == userId {
		return false, nil
	}

	var alreadyShared bool
	_ = s.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "SharedDocuments" WHERE "DocumentId" = $1 AND "UserId" = $2);`, doc.ID, userId).Scan(&alreadyShared)
	if alreadyShared {
		return false, nil
	}

	shareID := uuid.New().String()
	now := time.Now()
	accessLevel := doc.DefaultAccessLevel
	if accessLevel == "" {
		accessLevel = "View"
	}

	query := `
		INSERT INTO "SharedDocuments" ("Id", "DocumentId", "UserId", "AccessLevel", "SharedAt")
		VALUES ($1, $2, $3, $4, $5);
	`
	_, err = s.db.Pool.Exec(ctx, query, shareID, doc.ID, userId, accessLevel, now)
	if err == nil && s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			DocumentId: &doc.ID,
			ProjectId:  doc.FolderID,
			UserId:     userId,
			ActionType: "COLLABORATOR_JOINED",
			Details:    "Collaborator joined document with access: " + accessLevel,
		})
	}
	return err == nil, err
}

func (s *DocumentService) RemoveShare(ctx context.Context, id, userId, sharedUserId string) (bool, error) {
	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		return false, err
	}
	if doc.OwnerID != userId && !s.isFolderOrProjectOwner(ctx, doc.FolderID, userId) {
		return false, errors.New("forbidden")
	}

	tag, err := s.db.Pool.Exec(ctx, `DELETE FROM "SharedDocuments" WHERE "DocumentId" = $1 AND "UserId" = $2;`, id, sharedUserId)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.InvalidateDocumentAccess(ctx, id, sharedUserId)
	}
	if s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			DocumentId: &id,
			ProjectId:  doc.FolderID,
			UserId:     userId,
			TargetUser: sharedUserId,
			ActionType: "COLLABORATOR_REMOVED",
			Details:    "Collaborator access revoked from document",
		})
	}
	return tag.RowsAffected() > 0, nil
}

func (s *DocumentService) UpdateShareAccess(ctx context.Context, id, userId, sharedUserId, access string) (bool, error) {
	if access != "View" && access != "Edit" {
		return false, errors.New("invalid access level")
	}
	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		return false, err
	}
	if doc.OwnerID != userId && !s.isFolderOrProjectOwner(ctx, doc.FolderID, userId) {
		return false, errors.New("forbidden")
	}

	shareID := uuid.New().String()
	tag, err := s.db.Pool.Exec(ctx, `
		INSERT INTO "SharedDocuments" ("Id", "DocumentId", "UserId", "AccessLevel", "SharedAt")
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT ("DocumentId", "UserId")
		DO UPDATE SET "AccessLevel" = EXCLUDED."AccessLevel";
	`, shareID, id, sharedUserId, access)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.SetDocumentAccess(ctx, id, sharedUserId, access, DefaultACLCacheTTL)
	}
	if s.auditService != nil {
		_ = s.auditService.Record(ctx, &models.CreateAuditLogRequest{
			DocumentId: &id,
			ProjectId:  doc.FolderID,
			UserId:     userId,
			TargetUser: sharedUserId,
			ActionType: "PERMISSION_UPDATED",
			Details:    "Collaborator permission set to " + access,
		})
	}
	return tag.RowsAffected() > 0, nil
}

func (s *DocumentService) isFolderOrProjectOwner(ctx context.Context, folderId *string, userId string) bool {
	if folderId == nil || *folderId == "" {
		return false
	}
	curr := folderId
	for curr != nil && *curr != "" {
		var ownerId string
		var parentId *string
		err := s.db.Pool.QueryRow(ctx, `SELECT "OwnerId", "ParentFolderId" FROM "Folders" WHERE "Id" = $1;`, *curr).Scan(&ownerId, &parentId)
		if err != nil {
			break
		}
		if ownerId == userId {
			return true
		}
		curr = parentId
	}
	return false
}

func (s *DocumentService) UpdateCodeAccess(ctx context.Context, id, ownerId, access string) (bool, error) {
	if access != "View" && access != "Edit" {
		return false, errors.New("invalid access level")
	}
	doc, err := s.getRawDocument(ctx, id)
	if err != nil || doc.OwnerID != ownerId {
		return false, errors.New("forbidden")
	}

	tag, err := s.db.Pool.Exec(ctx, `UPDATE "Documents" SET "DefaultAccessLevel" = $1 WHERE "Id" = $2;`, access, id)
	if err != nil {
		return false, err
	}
	if s.aclCache != nil {
		_ = s.aclCache.InvalidateAllDocumentAccess(ctx, id)
	}
	return tag.RowsAffected() > 0, nil
}

func (s *DocumentService) Access(ctx context.Context, id, userId string) (string, error) {
	if s.aclCache != nil && userId != "" {
		if cached, hit, err := s.aclCache.GetDocumentAccess(ctx, id, userId); err == nil && hit {
			if cached == "None" {
				return "", nil
			}
			return cached, nil
		}
	}

	doc, err := s.getRawDocument(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			if s.aclCache != nil && userId != "" {
				_ = s.aclCache.SetDocumentAccess(ctx, id, userId, "None", DefaultACLCacheTTL)
			}
			return "", nil
		}
		return "", err
	}

	if doc.OwnerID == userId {
		if s.aclCache != nil && userId != "" {
			_ = s.aclCache.SetDocumentAccess(ctx, id, userId, "Edit", DefaultACLCacheTTL)
		}
		return "Edit", nil
	}

	var accessLevel string
	err = s.db.Pool.QueryRow(ctx, `SELECT "AccessLevel" FROM "SharedDocuments" WHERE "DocumentId" = $1 AND "UserId" = $2;`, id, userId).Scan(&accessLevel)
	if err == nil && accessLevel != "" {
		if s.aclCache != nil && userId != "" {
			_ = s.aclCache.SetDocumentAccess(ctx, id, userId, accessLevel, DefaultACLCacheTTL)
		}
		return accessLevel, nil
	}

	if doc.FolderID != nil && *doc.FolderID != "" {
		folderAccess, err := s.folderAccess(ctx, *doc.FolderID, userId)
		if err == nil && folderAccess != "" {
			if s.aclCache != nil && userId != "" {
				_ = s.aclCache.SetDocumentAccess(ctx, id, userId, folderAccess, DefaultACLCacheTTL)
			}
			return folderAccess, nil
		}
	}

	if s.aclCache != nil && userId != "" {
		_ = s.aclCache.SetDocumentAccess(ctx, id, userId, "None", DefaultACLCacheTTL)
	}
	return "", nil
}

func (s *DocumentService) CanEdit(ctx context.Context, id, userId string) (bool, error) {
	access, err := s.Access(ctx, id, userId)
	if err != nil {
		return false, err
	}
	return access == "Edit", nil
}

func (s *DocumentService) folderAccess(ctx context.Context, folderId, userId string) (string, error) {
	var (
		ownerId        string
		parentFolderId *string
	)
	err := s.db.Pool.QueryRow(ctx, `SELECT "OwnerId", "ParentFolderId" FROM "Folders" WHERE "Id" = $1;`, folderId).Scan(&ownerId, &parentFolderId)
	if err != nil {
		return "", err
	}
	if ownerId == userId {
		return "Edit", nil
	}

	var accessLevel string
	err = s.db.Pool.QueryRow(ctx, `SELECT "AccessLevel" FROM "SharedFolders" WHERE "FolderId" = $1 AND "UserId" = $2;`, folderId, userId).Scan(&accessLevel)
	if err == nil && accessLevel != "" {
		return accessLevel, nil
	}

	if parentFolderId != nil && *parentFolderId != "" {
		return s.folderAccess(ctx, *parentFolderId, userId)
	}

	return "", nil
}

func (s *DocumentService) getRawDocument(ctx context.Context, id string) (*models.Document, error) {
	query := `
		SELECT "Id", "Title", "Content", "OwnerId", "FolderId", "ShareCode",
		       "DefaultAccessLevel", "CreatedAt", "UpdatedAt", "LastEditedAt", "LastEditedBy"
		FROM "Documents"
		WHERE "Id" = $1;
	`
	var doc models.Document
	err := s.db.Pool.QueryRow(ctx, query, id).Scan(
		&doc.ID, &doc.Title, &doc.Content, &doc.OwnerID, &doc.FolderID, &doc.ShareCode,
		&doc.DefaultAccessLevel, &doc.CreatedAt, &doc.UpdatedAt, &doc.LastEditedAt, &doc.LastEditedBy,
	)
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func (s *DocumentService) toDto(ctx context.Context, doc *models.Document, viewerUserId string) (*models.DocumentDto, error) {
	var ownerName string
	_ = s.db.Pool.QueryRow(ctx, `SELECT "UserName" FROM "AspNetUsers" WHERE "Id" = $1;`, doc.OwnerID).Scan(&ownerName)
	if ownerName == "" {
		ownerName = "Unknown"
	}

	// Fetch shared users
	sharesQuery := `
		SELECT sd."Id", sd."DocumentId", sd."UserId", sd."AccessLevel", sd."SharedAt", u."UserName"
		FROM "SharedDocuments" sd
		LEFT JOIN "AspNetUsers" u ON sd."UserId" = u."Id"
		WHERE sd."DocumentId" = $1
		ORDER BY sd."SharedAt" DESC;
	`
	rows, err := s.db.Pool.Query(ctx, sharesQuery, doc.ID)
	var sharedWith []models.SharedDocumentDto
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var (
				sd       models.SharedDocument
				uNamePtr *string
			)
			_ = rows.Scan(&sd.ID, &sd.DocumentID, &sd.UserID, &sd.AccessLevel, &sd.SharedAt, &uNamePtr)
			uName := "Unknown"
			if uNamePtr != nil && *uNamePtr != "" {
				uName = *uNamePtr
			}
			sharedWith = append(sharedWith, models.SharedDocumentDto{
				ID:            sd.ID,
				DocumentID:    sd.DocumentID,
				DocumentTitle: doc.Title,
				UserID:        sd.UserID,
				UserName:      uName,
				SharedAt:      sd.SharedAt,
				AccessLevel:   sd.AccessLevel,
				FolderPath:    s.buildDocFolderPath(ctx, doc.FolderID),
			})
		}
	}
	if sharedWith == nil {
		sharedWith = []models.SharedDocumentDto{}
	}

	isShared := viewerUserId != "" && doc.OwnerID != viewerUserId
	permission := "Edit"
	if isShared {
		perm, _ := s.Access(ctx, doc.ID, viewerUserId)
		if perm != "" {
			permission = perm
		} else {
			permission = "View"
		}
	}

	content := doc.Content
	if s.rdb != nil {
		if cachedContent, err := s.rdb.Get(ctx, "livesync:doc:"+doc.ID+":content").Result(); err == nil && cachedContent != "" {
			content = cachedContent
		}
	}

	return &models.DocumentDto{
		ID:                 doc.ID,
		Title:              doc.Title,
		Content:            content,
		OwnerID:            doc.OwnerID,
		FolderID:           doc.FolderID,
		OwnerName:          ownerName,
		ShareCode:          doc.ShareCode,
		DefaultAccessLevel: doc.DefaultAccessLevel,
		CreatedAt:          doc.CreatedAt,
		UpdatedAt:          doc.UpdatedAt,
		LastEditedAt:       doc.LastEditedAt,
		LastEditedBy:       doc.LastEditedBy,
		SharedWith:         sharedWith,
		IsShared:           isShared,
		Permission:         permission,
	}, nil
}

func (s *DocumentService) buildDocFolderPath(ctx context.Context, folderId *string) []models.FolderPathNode {
	if folderId == nil || *folderId == "" {
		return []models.FolderPathNode{}
	}

	var path []models.FolderPathNode
	visited := make(map[string]bool)
	curr := *folderId

	for curr != "" && !visited[curr] {
		visited[curr] = true
		var (
			id, name       string
			parentFolderId *string
		)
		err := s.db.Pool.QueryRow(ctx, `SELECT "Id", "Name", "ParentFolderId" FROM "Folders" WHERE "Id" = $1;`, curr).Scan(&id, &name, &parentFolderId)
		if err != nil {
			break
		}
		path = append([]models.FolderPathNode{{ID: id, Name: name}}, path...)
		if parentFolderId != nil {
			curr = *parentFolderId
		} else {
			break
		}
	}

	return path
}

func generateRandomCode(length int) string {
	b := make([]byte, length)
	for i := range b {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(ShareChars))))
		b[i] = ShareChars[num.Int64()]
	}
	return string(b)
}
