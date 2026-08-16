package models

type ProjectManifestFileDto struct {
	Path        string `json:"path"`
	DocumentId  string `json:"documentId"`
	Title       string `json:"title"`
	Content     string `json:"content"`
	IsLocked    bool   `json:"isLocked"`
	AccessLevel string `json:"accessLevel,omitempty"`
}

type ProjectManifestDto struct {
	ProjectID   string                   `json:"projectId"`
	ProjectName string                   `json:"projectName"`
	OwnerID     string                   `json:"ownerId"`
	AccessLevel string                   `json:"accessLevel"`
	TotalFiles  int                      `json:"totalFiles"`
	Files       []ProjectManifestFileDto `json:"files"`
}
