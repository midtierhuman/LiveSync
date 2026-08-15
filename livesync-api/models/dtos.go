package models

import (
	"time"
)

// Auth DTOs
type RegisterRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
	FirstName       string `json:"firstName"`
	LastName        string `json:"lastName"`
}

type LoginRequest struct {
	EmailOrUsername string `json:"emailOrUsername"`
	Password        string `json:"password"`
	RememberMe      *bool  `json:"rememberMe"`
}

type OAuthLoginRequest struct {
	Provider    string `json:"provider"`
	AccessToken string `json:"accessToken"`
}

type UserInfo struct {
	ID        string  `json:"id"`
	Email     *string `json:"email"`
	UserName  *string `json:"userName"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
}

type AuthResponse struct {
	Success    bool       `json:"success"`
	Message    string     `json:"message"`
	Token      *string    `json:"token"`
	Expiration *time.Time `json:"expiration"`
	User       *UserInfo  `json:"user"`
}

// Document DTOs
type DocumentDto struct {
	ID                 string              `json:"id"`
	Title              string              `json:"title"`
	Content            string              `json:"content"`
	OwnerID            string              `json:"ownerId"`
	FolderID           *string             `json:"folderId"`
	OwnerName          string              `json:"ownerName"`
	ShareCode          *string             `json:"shareCode"`
	DefaultAccessLevel string              `json:"defaultAccessLevel"`
	CreatedAt          time.Time           `json:"createdAt"`
	UpdatedAt          time.Time           `json:"updatedAt"`
	LastEditedAt       *time.Time          `json:"lastEditedAt"`
	LastEditedBy       *string             `json:"lastEditedBy"`
	SharedWith         []SharedDocumentDto `json:"sharedWith"`
	IsShared           bool                `json:"isShared"`
	Permission         string              `json:"permission"`
}

type SharedDocumentDto struct {
	ID            string           `json:"id"`
	DocumentID    string           `json:"documentId"`
	DocumentTitle string           `json:"documentTitle"`
	UserID        string           `json:"userId"`
	UserName      string           `json:"userName"`
	SharedAt      time.Time        `json:"sharedAt"`
	AccessLevel   string           `json:"accessLevel"`
	FolderPath    []FolderPathNode `json:"folderPath"`
}

type CreateDocumentRequest struct {
	Title    string  `json:"title"`
	Content  string  `json:"content"`
	FolderID *string `json:"folderId,omitempty"`
}

type UpdateDocumentRequest struct {
	Title        *string `json:"title"`
	Content      *string `json:"content"`
	LastEditedBy *string `json:"lastEditedBy"`
}

type DocumentContentUpdateRequest struct {
	Content      string  `json:"content"`
	LastEditedBy *string `json:"lastEditedBy"`
}

type AddSharedDocumentRequest struct {
	ShareCode string `json:"shareCode"`
}

type UpdateAccessLevelRequest struct {
	AccessLevel string `json:"accessLevel"`
}

// Folder DTOs
type CreateFolderRequest struct {
	Name           string  `json:"name"`
	ParentFolderID *string `json:"parentFolderId"`
}

type UpdateFolderRequest struct {
	Name string `json:"name"`
}

type MoveDocumentRequest struct {
	FolderID *string `json:"folderId"`
}

type MoveFolderRequest struct {
	TargetParentFolderID *string `json:"targetParentFolderId"`
}

type AddSharedFolderRequest struct {
	ShareCode string `json:"shareCode"`
}

type FolderPathNode struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type FolderDto struct {
	ID                 string                `json:"id"`
	Name               string                `json:"name"`
	OwnerID            string                `json:"ownerId"`
	ParentFolderID     *string               `json:"parentFolderId"`
	ShareCode          *string               `json:"shareCode"`
	DefaultAccessLevel string                `json:"defaultAccessLevel"`
	CreatedAt          time.Time             `json:"createdAt"`
	UpdatedAt          time.Time             `json:"updatedAt"`
	SubfoldersCount    int                   `json:"subfoldersCount"`
	DocumentsCount     int                   `json:"documentsCount"`
	Subfolders         []FolderDto           `json:"subfolders"`
	Documents          []DocumentDto         `json:"documents"`
	FolderPath         []FolderPathNode      `json:"folderPath"`
	SharedWith         []SharedFolderUserDto `json:"sharedWith"`
	IsShared           bool                  `json:"isShared"`
	Permission         string                `json:"permission"`
}

type SharedFolderUserDto struct {
	ID          string    `json:"id"`
	FolderID    string    `json:"folderId"`
	UserID      string    `json:"userId"`
	UserName    string    `json:"userName"`
	SharedAt    time.Time `json:"sharedAt"`
	AccessLevel string    `json:"accessLevel"`
}

type SharedFolderDto struct {
	ID          string    `json:"id"`
	FolderID    string    `json:"folderId"`
	FolderName  string    `json:"folderName"`
	OwnerID     string    `json:"ownerId"`
	OwnerEmail  string    `json:"ownerEmail"`
	SharedAt    time.Time `json:"sharedAt"`
	AccessLevel string    `json:"accessLevel"`
	PathIDs     []string  `json:"pathIds"`
	PathNames   []string  `json:"pathNames"`
}
