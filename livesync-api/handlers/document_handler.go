package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/livesync/livesync-api/models"
	"github.com/livesync/livesync-api/security"
	"github.com/livesync/livesync-api/services"
)

type DocumentHandler struct {
	docService   *services.DocumentService
	authMW       *security.AuthMiddleware
	auditService *services.AuditService
}

func NewDocumentHandler(docService *services.DocumentService, authMW *security.AuthMiddleware, auditService *services.AuditService) *DocumentHandler {
	return &DocumentHandler{
		docService:   docService,
		authMW:       authMW,
		auditService: auditService,
	}
}

func (h *DocumentHandler) RegisterRoutes(r chi.Router) {
	r.Route("/api/documents", func(r chi.Router) {
		// Public route (access by share code)
		r.Get("/share/{code}", h.ByShareCode)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(h.authMW.RequireAuth)

			r.Get("/my-documents", h.MyDocuments)
			r.Get("/shared-with-me", h.SharedWithMe)
			r.Post("/", h.Create)
			r.Post("/add-shared", h.AddShared)

			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", h.Get)
				r.Put("/", h.Update)
				r.Put("/content", h.UpdateContent)
				r.Delete("/", h.Delete)
				r.Get("/access", h.GetAccess)
				r.Get("/audit-logs", h.GetAuditLogs)
				r.Post("/generate-share-code", h.GenerateShareCode)
				r.Delete("/shared/{sharedUserId}", h.RemoveShare)
				r.Put("/shared/{sharedUserId}/access-level", h.UpdateShareAccessLevel)
				r.Put("/share-code-access-level", h.UpdateShareCodeAccessLevel)
			})
		})
	})
}

func (h *DocumentHandler) MyDocuments(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	docs, err := h.docService.Owned(r.Context(), userId)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

func (h *DocumentHandler) SharedWithMe(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	docs, err := h.docService.Shared(r.Context(), userId)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

func (h *DocumentHandler) Get(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.docService.Access(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	doc, err := h.docService.Find(r.Context(), id, userId)
	if err != nil || doc == nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Access denied"})
		return
	}

	writeJSON(w, http.StatusOK, doc)
}

func (h *DocumentHandler) GetAccess(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.docService.Access(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"accessLevel": access})
}

func (h *DocumentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	var req models.CreateDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Title) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Document title is required."})
		return
	}

	doc, err := h.docService.Create(r.Context(), userId, &req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}

	w.Header().Set("Location", "/api/documents/"+doc.ID)
	writeJSON(w, http.StatusCreated, doc)
}

func (h *DocumentHandler) Update(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.docService.Access(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}
	if access != "Edit" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "You don't have edit access to this document"})
		return
	}

	var req models.UpdateDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid request payload."})
		return
	}

	doc, err := h.docService.Update(r.Context(), id, userId, &req)
	if err != nil || doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	writeJSON(w, http.StatusOK, doc)
}

func (h *DocumentHandler) UpdateContent(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.docService.Access(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}
	if access != "Edit" {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "You don't have edit access to this document"})
		return
	}

	var req models.DocumentContentUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid request payload."})
		return
	}

	doc, err := h.docService.UpdateContent(r.Context(), id, userId, &req)
	if err != nil || doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	writeJSON(w, http.StatusOK, doc)
}

func (h *DocumentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.docService.Access(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	deleted, err := h.docService.Delete(r.Context(), id, userId)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Only the document owner can delete this document"})
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *DocumentHandler) GenerateShareCode(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	doc, err := h.docService.GenerateShareCode(r.Context(), id, userId)
	if err != nil || doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found or access denied."})
		return
	}

	writeJSON(w, http.StatusOK, doc)
}

func (h *DocumentHandler) ByShareCode(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	doc, err := h.docService.ByShareCode(r.Context(), code)
	if err != nil || doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	writeJSON(w, http.StatusOK, doc)
}

func (h *DocumentHandler) AddShared(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	var req models.AddSharedDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.ShareCode) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid share code"})
		return
	}

	added, err := h.docService.AddShare(r.Context(), req.ShareCode, userId)
	if err != nil || !added {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid share code or already added"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Document added successfully"})
}

func (h *DocumentHandler) RemoveShare(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")
	sharedUserId := chi.URLParam(r, "sharedUserId")

	removed, err := h.docService.RemoveShare(r.Context(), id, userId, sharedUserId)
	if err != nil || !removed {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Share record not found or access denied."})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *DocumentHandler) UpdateShareAccessLevel(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")
	sharedUserId := chi.URLParam(r, "sharedUserId")

	var req models.UpdateAccessLevelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.AccessLevel != "View" && req.AccessLevel != "Edit") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid access level. Must be 'View' or 'Edit'"})
		return
	}

	updated, err := h.docService.UpdateShareAccess(r.Context(), id, userId, sharedUserId, req.AccessLevel)
	if err != nil {
		if err.Error() == "forbidden" {
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "Only the document owner or project owner can change access levels"})
		} else {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		}
		return
	}
	if !updated {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Share not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Access level updated successfully"})
}

func (h *DocumentHandler) UpdateShareCodeAccessLevel(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	var req models.UpdateAccessLevelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.AccessLevel != "View" && req.AccessLevel != "Edit") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid access level. Must be 'View' or 'Edit'"})
		return
	}

	updated, err := h.docService.UpdateCodeAccess(r.Context(), id, userId, req.AccessLevel)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "Only the document owner can change access levels"})
		return
	}
	if !updated {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Share code access level updated successfully"})
}

func (h *DocumentHandler) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	userId, _ := security.GetUserID(r.Context())
	id := chi.URLParam(r, "id")

	access, err := h.docService.Access(r.Context(), id, userId)
	if err != nil || access == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "Document not found or access denied"})
		return
	}

	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil && val >= 0 {
			offset = val
		}
	}

	if h.auditService == nil {
		writeJSON(w, http.StatusOK, []models.AuditLog{})
		return
	}

	logs, err := h.auditService.GetDocumentAuditLogs(r.Context(), id, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, logs)
}
