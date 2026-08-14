package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/livesync/livesync-api/models"
	"github.com/livesync/livesync-api/security"
	"github.com/livesync/livesync-api/services"
)

type FolderHandler struct {
	folderService *services.FolderService
	authMW        *security.AuthMiddleware
}

func NewFolderHandler(folderService *services.FolderService, authMW *security.AuthMiddleware) *FolderHandler {
	return &FolderHandler{
		folderService: folderService,
		authMW:        authMW,
	}
}

func (h *FolderHandler) RegisterRoutes(r chi.Router) {
	r.Route("/api/folders", func(r chi.Router) {
		// Public route
		r.Get("/share/{code}", h.ByShareCode)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(h.authMW.RequireAuth)

			r.Get("/my-folders", h.MyFolders)
			r.Get("/shared-with-me", h.SharedWithMe)
			r.Get("/shared-with-me/details", h.SharedWithMeDetails)
			r.Post("/", h.Create)
			r.Post("/add-shared", h.AddShared)
			r.Put("/move-document/{documentId}", h.MoveDocument)
			r.Put("/move-folder/{folderId}", h.MoveFolder)

			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", h.Get)
				r.Put("/", h.Update)
				r.Delete("/", h.Delete)
				r.Post("/generate-share-code", h.GenerateShareCode)
			})
		})
	})
}

func (h *FolderHandler) MyFolders(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	folders, err := h.folderService.Owned(r.Context(), userId)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, folders)
}

func (h *FolderHandler) SharedWithMe(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	folders, err := h.folderService.Shared(r.Context(), userId)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, folders)
}

func (h *FolderHandler) SharedWithMeDetails(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	folders, err := h.folderService.SharedFolderDetails(r.Context(), userId)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, folders)
}

func (h *FolderHandler) ByShareCode(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	folder, err := h.folderService.ByShareCode(r.Context(), code)
	if err != nil || folder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found"})
		return
	}
	writeJSON(w, http.StatusOK, folder)
}

func (h *FolderHandler) GenerateShareCode(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	folder, err := h.folderService.GenerateShareCode(r.Context(), id, userId)
	if err != nil || folder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found or access denied."})
		return
	}
	writeJSON(w, http.StatusOK, folder)
}

func (h *FolderHandler) Get(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.folderService.GetAccessLevel(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found"})
		return
	}

	folder, err := h.folderService.Find(r.Context(), id, userId)
	if err != nil || folder == nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Access denied"})
		return
	}

	writeJSON(w, http.StatusOK, folder)
}

func (h *FolderHandler) Create(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	var req models.CreateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Folder name is required"})
		return
	}

	folder, err := h.folderService.Create(r.Context(), userId, &req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}

	w.Header().Set("Location", "/api/folders/"+folder.ID)
	writeJSON(w, http.StatusCreated, folder)
}

func (h *FolderHandler) Update(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.folderService.GetAccessLevel(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found"})
		return
	}
	if access != "Edit" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "You don't have edit access to this folder"})
		return
	}

	var req models.UpdateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Folder name is required"})
		return
	}

	folder, err := h.folderService.Update(r.Context(), id, userId, &req)
	if err != nil || folder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found"})
		return
	}

	writeJSON(w, http.StatusOK, folder)
}

func (h *FolderHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.folderService.GetAccessLevel(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found"})
		return
	}

	deleted, err := h.folderService.Delete(r.Context(), id, userId)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Only the folder owner can delete this folder"})
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Folder not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *FolderHandler) MoveDocument(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	documentId := chi.URLParam(r, "documentId")

	var req models.MoveDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid request payload"})
		return
	}

	moved, err := h.folderService.MoveDocument(r.Context(), documentId, userId, req.FolderID)
	if err != nil || !moved {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Failed to move document"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Document moved successfully"})
}

func (h *FolderHandler) MoveFolder(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	folderId := chi.URLParam(r, "folderId")

	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid request payload"})
		return
	}

	var targetParentFolderId *string
	if val, ok := body["targetParentFolderId"]; ok && strings.TrimSpace(val) != "" {
		t := strings.TrimSpace(val)
		targetParentFolderId = &t
	}

	moved, err := h.folderService.MoveFolder(r.Context(), folderId, userId, targetParentFolderId)
	if err != nil || !moved {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Failed to move folder"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Folder moved successfully"})
}

func (h *FolderHandler) AddShared(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())

	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body["shareCode"]) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Share code is required"})
		return
	}

	shareCode := strings.TrimSpace(body["shareCode"])
	joined, err := h.folderService.AddFolderShare(r.Context(), shareCode, userId)
	if err != nil || !joined {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid share code or already joined"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Folder joined successfully"})
}
