package models

import (
	"time"
)

type Folder struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	OwnerID            string    `json:"ownerId"`
	ParentFolderID     *string   `json:"parentFolderId"`
	ShareCode          *string   `json:"shareCode"`
	DefaultAccessLevel string    `json:"defaultAccessLevel"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type SharedFolder struct {
	ID          string    `json:"id"`
	FolderID    string    `json:"folderId"`
	UserID      string    `json:"userId"`
	AccessLevel string    `json:"accessLevel"`
	SharedAt    time.Time `json:"sharedAt"`
}
