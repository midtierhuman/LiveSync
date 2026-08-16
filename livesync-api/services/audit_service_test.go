package services

import (
	"testing"
	"github.com/livesync/livesync-api/models"
)

func TestAuditLogModel_Structure(t *testing.T) {
	projID := "proj-1"
	docID := "doc-1"
	req := models.CreateAuditLogRequest{
		ProjectId:  &projID,
		DocumentId: &docID,
		UserId:     "user-123",
		UserEmail:  "test@example.com",
		ActionType: "PERMISSION_UPDATED",
		TargetUser: "user-456",
		Details:    "Collaborator permission set to Edit",
	}

	if req.UserId != "user-123" {
		t.Fatalf("expected userId 'user-123', got %s", req.UserId)
	}
	if req.ActionType != "PERMISSION_UPDATED" {
		t.Fatalf("expected actionType 'PERMISSION_UPDATED', got %s", req.ActionType)
	}
}
