package services

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/livesync/livesync-api/database"
	"github.com/livesync/livesync-api/models"
)

type AuditService struct {
	db *database.DB
}

func NewAuditService(db *database.DB) *AuditService {
	return &AuditService{db: db}
}

func (s *AuditService) Record(ctx context.Context, req *models.CreateAuditLogRequest) error {
	id := uuid.New().String()
	now := time.Now()

	// If UserEmail not provided, lookup email from AspNetUsers
	userEmail := req.UserEmail
	if userEmail == "" && req.UserId != "" {
		var email *string
		_ = s.db.Pool.QueryRow(ctx, `SELECT "Email" FROM "AspNetUsers" WHERE "Id" = $1 LIMIT 1`, req.UserId).Scan(&email)
		if email != nil {
			userEmail = *email
		}
	}

	query := `
		INSERT INTO "AuditLogs" ("Id", "ProjectId", "DocumentId", "UserId", "UserEmail", "ActionType", "TargetUser", "Details", "CreatedAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
	`
	_, err := s.db.Pool.Exec(ctx, query, id, req.ProjectId, req.DocumentId, req.UserId, userEmail, req.ActionType, req.TargetUser, req.Details, now)
	return err
}

func (s *AuditService) GetProjectAuditLogs(ctx context.Context, projectId string, limit, offset int) ([]models.AuditLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	query := `
		SELECT "Id", "ProjectId", "DocumentId", "UserId", "UserEmail", "ActionType", "TargetUser", "Details", "CreatedAt"
		FROM "AuditLogs"
		WHERE "ProjectId" = $1
		ORDER BY "CreatedAt" DESC
		LIMIT $2 OFFSET $3;
	`
	rows, err := s.db.Pool.Query(ctx, query, projectId, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		var uEmail, targetUser *string
		if err := rows.Scan(&l.ID, &l.ProjectId, &l.DocumentId, &l.UserId, &uEmail, &l.ActionType, &targetUser, &l.Details, &l.CreatedAt); err != nil {
			return nil, err
		}
		if uEmail != nil {
			l.UserEmail = *uEmail
		}
		if targetUser != nil {
			l.TargetUser = *targetUser
		}
		logs = append(logs, l)
	}

	if logs == nil {
		logs = []models.AuditLog{}
	}
	return logs, nil
}

func (s *AuditService) GetDocumentAuditLogs(ctx context.Context, documentId string, limit, offset int) ([]models.AuditLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	query := `
		SELECT "Id", "ProjectId", "DocumentId", "UserId", "UserEmail", "ActionType", "TargetUser", "Details", "CreatedAt"
		FROM "AuditLogs"
		WHERE "DocumentId" = $1
		ORDER BY "CreatedAt" DESC
		LIMIT $2 OFFSET $3;
	`
	rows, err := s.db.Pool.Query(ctx, query, documentId, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []models.AuditLog
	for rows.Next() {
		var l models.AuditLog
		var uEmail, targetUser *string
		if err := rows.Scan(&l.ID, &l.ProjectId, &l.DocumentId, &l.UserId, &uEmail, &l.ActionType, &targetUser, &l.Details, &l.CreatedAt); err != nil {
			return nil, err
		}
		if uEmail != nil {
			l.UserEmail = *uEmail
		}
		if targetUser != nil {
			l.TargetUser = *targetUser
		}
		logs = append(logs, l)
	}

	if logs == nil {
		logs = []models.AuditLog{}
	}
	return logs, nil
}
