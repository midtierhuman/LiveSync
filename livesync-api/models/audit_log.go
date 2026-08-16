package models

import "time"

type AuditLog struct {
	ID         string    `json:"id"`
	ProjectId  *string   `json:"projectId,omitempty"`
	DocumentId *string   `json:"documentId,omitempty"`
	UserId     string    `json:"userId"`
	UserEmail  string    `json:"userEmail,omitempty"`
	ActionType string    `json:"actionType"`
	TargetUser string    `json:"targetUser,omitempty"`
	Details    string    `json:"details"`
	CreatedAt  time.Time `json:"createdAt"`
}

type CreateAuditLogRequest struct {
	ProjectId  *string `json:"projectId,omitempty"`
	DocumentId *string `json:"documentId,omitempty"`
	UserId     string  `json:"userId"`
	UserEmail  string  `json:"userEmail,omitempty"`
	ActionType string  `json:"actionType"`
	TargetUser string  `json:"targetUser,omitempty"`
	Details    string  `json:"details"`
}
