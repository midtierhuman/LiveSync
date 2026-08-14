package models

import (
	"time"
)

type Document struct {
	ID                 string     `json:"id"`
	Title              string     `json:"title"`
	Content            string     `json:"content"`
	OwnerID            string     `json:"ownerId"`
	FolderID           *string    `json:"folderId"`
	ShareCode          *string    `json:"shareCode"`
	DefaultAccessLevel string     `json:"defaultAccessLevel"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
	LastEditedAt       *time.Time `json:"lastEditedAt"`
	LastEditedBy       *string    `json:"lastEditedBy"`
}

type SharedDocument struct {
	ID          string    `json:"id"`
	DocumentID  string    `json:"documentId"`
	UserID      string    `json:"userId"`
	AccessLevel string    `json:"accessLevel"`
	SharedAt    time.Time `json:"sharedAt"`
}
