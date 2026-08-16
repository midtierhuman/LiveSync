package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/livesync/livesync-gateway/config"
	"github.com/livesync/livesync-gateway/middleware"
)

// SearchMatch represents a single text occurrence within a file.
type SearchMatch struct {
	LineNumber  int    `json:"lineNumber"`
	LineContent string `json:"lineContent"`
	Preview     string `json:"preview"`
	StartColumn int    `json:"startColumn"`
	EndColumn   int    `json:"endColumn"`
	MatchText   string `json:"matchText"`
}

// FileSearchResult represents all matches found within a single file.
type FileSearchResult struct {
	File       string        `json:"file"`
	MatchCount int           `json:"matchCount"`
	Matches    []SearchMatch `json:"matches"`
}

// WorkspaceSearchResponse represents the payload returned by the workspace search endpoint.
type WorkspaceSearchResponse struct {
	Status       string             `json:"status"`
	ProjectID    string             `json:"projectId"`
	Query        string             `json:"query"`
	TotalMatches int                `json:"totalMatches"`
	TotalFiles   int                `json:"totalFiles"`
	DurationMs   int64              `json:"durationMs"`
	Results      []FileSearchResult `json:"results"`
}

// WorkspaceReplaceRequest defines the payload for multi-file replace operations.
type WorkspaceReplaceRequest struct {
	ProjectID      string   `json:"projectId,omitempty"`
	Query          string   `json:"query"`
	Replacement    string   `json:"replacement"`
	IsRegex        bool     `json:"isRegex,omitempty"`
	MatchCase      bool     `json:"matchCase,omitempty"`
	MatchWholeWord bool     `json:"matchWholeWord,omitempty"`
	Files          []string `json:"files,omitempty"`       // Optional filter to restrict replace to specific files
	TargetFile     string   `json:"targetFile,omitempty"`  // For single match replace
	TargetLine     int      `json:"targetLine,omitempty"`  // For single match replace (1-based)
	TargetStartCol int      `json:"targetStartCol,omitempty"` // For single match replace (0-based)
	TargetEndCol   int      `json:"targetEndCol,omitempty"`   // For single match replace (0-based)
}

// WorkspaceReplaceResponse defines the response after performing replace.
type WorkspaceReplaceResponse struct {
	Status          string            `json:"status"`
	ProjectID       string            `json:"projectId"`
	ReplacedMatches int               `json:"replacedMatches"`
	ReplacedFiles   int               `json:"replacedFiles"`
	UpdatedFiles    map[string]string `json:"updatedFiles,omitempty"`
	Timestamp       int64             `json:"timestamp"`
	Error           string            `json:"error,omitempty"`
}

// WorkspaceSearchHandler handles workspace-wide searching and replacing.
type WorkspaceSearchHandler struct {
	cfg      *config.Config
	registry *SuppressionRegistry
}

// NewWorkspaceSearchHandler creates a new handler instance.
func NewWorkspaceSearchHandler(cfg *config.Config) *WorkspaceSearchHandler {
	return &WorkspaceSearchHandler{
		cfg:      cfg,
		registry: GetGlobalSuppressionRegistry(),
	}
}

// HandleSearch processes GET /api/workspaces/:id/search and /api/workspaces/search queries.
func (h *WorkspaceSearchHandler) HandleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	startTime := time.Now()
	projectID := extractProjectIDFromRequest(r)
	if projectID == "" {
		projectID = "default"
	}

	tokenStr := middleware.GetUserToken(r.Context())
	accessLevel, accessErr := middleware.VerifyWorkspaceAccess(r.Context(), h.cfg, projectID, tokenStr)
	if accessErr != nil || accessLevel == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Forbidden: Insufficient permissions to search workspace",
			"code":  "FORBIDDEN",
		})
		return
	}

	query := r.URL.Query().Get("query")
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(WorkspaceSearchResponse{
			Status:       "ok",
			ProjectID:    projectID,
			Query:        "",
			TotalMatches: 0,
			TotalFiles:   0,
			DurationMs:   time.Since(startTime).Milliseconds(),
			Results:      []FileSearchResult{},
		})
		return
	}

	isRegex := r.URL.Query().Get("isRegex") == "true"
	matchCase := r.URL.Query().Get("matchCase") == "true"
	matchWholeWord := r.URL.Query().Get("matchWholeWord") == "true"
	includePattern := r.URL.Query().Get("include")
	excludePattern := r.URL.Query().Get("exclude")

	// Compile search regex
	searchRegex, err := buildSearchRegex(query, isRegex, matchCase, matchWholeWord)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Invalid regular expression: %v", err),
		})
		return
	}

	safeID := sanitizeWorkspaceID(projectID)
	workspaceDir := filepath.Join(".", "workspaces", safeID)
	absWsDir, err := filepath.Abs(workspaceDir)
	if err != nil {
		absWsDir = workspaceDir
	}

	if _, err := os.Stat(absWsDir); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(WorkspaceSearchResponse{
			Status:       "ok",
			ProjectID:    projectID,
			Query:        query,
			TotalMatches: 0,
			TotalFiles:   0,
			DurationMs:   time.Since(startTime).Milliseconds(),
			Results:      []FileSearchResult{},
		})
		return
	}

	results := make([]FileSearchResult, 0)
	totalMatches := 0

	_ = filepath.Walk(absWsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		rel, relErr := filepath.Rel(absWsDir, path)
		if relErr != nil || isIgnoredPath(rel) {
			return nil
		}

		slashRel := filepath.ToSlash(rel)

		// Filter include/exclude patterns if provided
		if includePattern != "" && !matchesGlobOrContains(slashRel, includePattern) {
			return nil
		}
		if excludePattern != "" && matchesGlobOrContains(slashRel, excludePattern) {
			return nil
		}

		// Don't search large files (> 5MB) or binary files
		if info.Size() > 5*1024*1024 {
			return nil
		}

		file, openErr := os.Open(path)
		if openErr != nil {
			return nil
		}
		defer file.Close()

		var fileMatches []SearchMatch
		scanner := bufio.NewScanner(file)
		lineNum := 1

		for scanner.Scan() {
			line := scanner.Text()
			locs := searchRegex.FindAllStringIndex(line, -1)
			if len(locs) > 0 {
				for _, loc := range locs {
					startCol := loc[0]
					endCol := loc[1]
					matchedText := line[startCol:endCol]

					fileMatches = append(fileMatches, SearchMatch{
						LineNumber:  lineNum,
						LineContent: line,
						Preview:     strings.TrimSpace(line),
						StartColumn: startCol,
						EndColumn:   endCol,
						MatchText:   matchedText,
					})
					totalMatches++
				}
			}
			lineNum++
		}

		if len(fileMatches) > 0 {
			results = append(results, FileSearchResult{
				File:       slashRel,
				MatchCount: len(fileMatches),
				Matches:    fileMatches,
			})
		}

		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(WorkspaceSearchResponse{
		Status:       "ok",
		ProjectID:    projectID,
		Query:        query,
		TotalMatches: totalMatches,
		TotalFiles:   len(results),
		DurationMs:   time.Since(startTime).Milliseconds(),
		Results:      results,
	})
}

// HandleReplace processes POST /api/workspaces/:id/replace requests.
func (h *WorkspaceSearchHandler) HandleReplace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req WorkspaceReplaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
		return
	}

	projectID := req.ProjectID
	if projectID == "" {
		projectID = extractProjectIDFromRequest(r)
	}
	if projectID == "" {
		projectID = "default"
	}

	tokenStr := middleware.GetUserToken(r.Context())
	accessLevel, accessErr := middleware.VerifyWorkspaceAccess(r.Context(), h.cfg, projectID, tokenStr)
	if accessErr != nil || (accessLevel != "Edit" && accessLevel != "Owner" && accessLevel != "Admin") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Forbidden: Insufficient permissions to replace content in workspace",
			"code":  "FORBIDDEN",
		})
		return
	}

	if req.Query == "" {
		http.Error(w, `{"error":"Query string cannot be empty"}`, http.StatusBadRequest)
		return
	}

	searchRegex, err := buildSearchRegex(req.Query, req.IsRegex, req.MatchCase, req.MatchWholeWord)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Invalid regular expression: %v", err),
		})
		return
	}

	safeID := sanitizeWorkspaceID(projectID)
	workspaceDir := filepath.Join(".", "workspaces", safeID)
	absWsDir, err := filepath.Abs(workspaceDir)
	if err != nil {
		absWsDir = workspaceDir
	}

	if _, err := os.Stat(absWsDir); os.IsNotExist(err) {
		http.Error(w, `{"error":"Workspace directory not found"}`, http.StatusNotFound)
		return
	}

	updatedFiles := make(map[string]string)
	replacedMatches := 0
	replacedFiles := 0

	// Handle targeted single-match replacement
	if req.TargetFile != "" && req.TargetLine > 0 {
		cleanedTarget := filepath.ToSlash(filepath.Clean(req.TargetFile))
		targetPath := filepath.Join(absWsDir, filepath.FromSlash(cleanedTarget))

		contentBytes, readErr := os.ReadFile(targetPath)
		if readErr != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to read target file: %v"}`, readErr), http.StatusInternalServerError)
			return
		}

		lines := strings.Split(string(contentBytes), "\n")
		targetLineIdx := req.TargetLine - 1
		if targetLineIdx >= 0 && targetLineIdx < len(lines) {
			line := lines[targetLineIdx]
			if req.TargetStartCol >= 0 && req.TargetEndCol <= len(line) && req.TargetStartCol <= req.TargetEndCol {
				newLine := line[:req.TargetStartCol] + req.Replacement + line[req.TargetEndCol:]
				lines[targetLineIdx] = newLine
				newContent := strings.Join(lines, "\n")

				// Sync through atomic suppression engine
				h.registry.Register(absWsDir, cleanedTarget, HashContentString(newContent), 5*time.Second)
				_ = os.WriteFile(targetPath, []byte(newContent), 0644)

				updatedFiles[cleanedTarget] = newContent
				replacedMatches = 1
				replacedFiles = 1
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(WorkspaceReplaceResponse{
			Status:          "ok",
			ProjectID:       projectID,
			ReplacedMatches: replacedMatches,
			ReplacedFiles:   replacedFiles,
			UpdatedFiles:    updatedFiles,
			Timestamp:       time.Now().UnixMilli(),
		})
		return
	}

	// Multi-file batch replacement
	allowedFiles := make(map[string]bool)
	for _, f := range req.Files {
		if f != "" {
			allowedFiles[filepath.ToSlash(filepath.Clean(f))] = true
		}
	}

	_ = filepath.Walk(absWsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		rel, relErr := filepath.Rel(absWsDir, path)
		if relErr != nil || isIgnoredPath(rel) {
			return nil
		}

		slashRel := filepath.ToSlash(rel)
		if len(allowedFiles) > 0 && !allowedFiles[slashRel] {
			return nil
		}

		contentBytes, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}

		contentStr := string(contentBytes)
		matches := searchRegex.FindAllStringIndex(contentStr, -1)
		if len(matches) == 0 {
			return nil
		}

		// Replace occurrences
		newContent := searchRegex.ReplaceAllString(contentStr, req.Replacement)
		if newContent != contentStr {
			h.registry.Register(absWsDir, slashRel, HashContentString(newContent), 5*time.Second)
			_ = os.WriteFile(path, []byte(newContent), 0644)

			updatedFiles[slashRel] = newContent
			replacedMatches += len(matches)
			replacedFiles++
		}

		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(WorkspaceReplaceResponse{
		Status:          "ok",
		ProjectID:       projectID,
		ReplacedMatches: replacedMatches,
		ReplacedFiles:   replacedFiles,
		UpdatedFiles:    updatedFiles,
		Timestamp:       time.Now().UnixMilli(),
	})
}

// Helper: buildSearchRegex builds the compiled Regexp from search parameters.
func buildSearchRegex(query string, isRegex, matchCase, matchWholeWord bool) (*regexp.Regexp, error) {
	pattern := query
	if !isRegex {
		pattern = regexp.QuoteMeta(query)
	}

	if matchWholeWord {
		pattern = fmt.Sprintf(`\b(?:%s)\b`, pattern)
	}

	if !matchCase {
		pattern = "(?i)" + pattern
	}

	return regexp.Compile(pattern)
}

// Helper: extractProjectIDFromRequest extracts project / workspace ID from request path or query.
func extractProjectIDFromRequest(r *http.Request) string {
	path := strings.TrimPrefix(r.URL.Path, "/api/workspaces")
	path = strings.TrimPrefix(path, "/")
	parts := strings.Split(path, "/")

	if len(parts) > 0 && parts[0] != "" && parts[0] != "search" && parts[0] != "replace" && parts[0] != "sync" {
		return parts[0]
	}

	if id := r.URL.Query().Get("projectId"); id != "" {
		return id
	}
	if id := r.URL.Query().Get("id"); id != "" {
		return id
	}
	return "default"
}

// Helper: matchesGlobOrContains checks if a path matches wildcard pattern or contains the substring.
func matchesGlobOrContains(path, pattern string) bool {
	pattern = filepath.ToSlash(pattern)
	matched, err := filepath.Match(pattern, filepath.Base(path))
	if err == nil && matched {
		return true
	}
	matchedFull, err2 := filepath.Match(pattern, path)
	if err2 == nil && matchedFull {
		return true
	}
	return strings.Contains(strings.ToLower(path), strings.ToLower(pattern))
}
