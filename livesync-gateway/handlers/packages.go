package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/livesync/livesync-gateway/config"
)

type PackagesHandler struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewPackagesHandler(cfg *config.Config) *PackagesHandler {
	return &PackagesHandler{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 4 * time.Second,
		},
	}
}

type PackageHTTPItem struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

type PackageHTTPResponse struct {
	Query    string            `json:"query"`
	Packages []PackageHTTPItem `json:"packages"`
}

var popularPythonPackages = []PackageHTTPItem{
	{Name: "transformers", Version: "latest", Description: "State-of-the-art Machine Learning for PyTorch, TensorFlow, and JAX"},
	{Name: "torch", Version: "latest", Description: "Tensors and Dynamic neural networks in Python with GPU acceleration"},
	{Name: "numpy", Version: "latest", Description: "Fundamental package for array computing with Python"},
	{Name: "pandas", Version: "latest", Description: "Powerful data structures for data analysis and statistics"},
	{Name: "scipy", Version: "latest", Description: "Fundamental algorithms for scientific computing in Python"},
	{Name: "matplotlib", Version: "latest", Description: "Comprehensive library for static and animated visualizations"},
	{Name: "scikit-learn", Version: "latest", Description: "Machine learning and data mining in Python"},
	{Name: "requests", Version: "latest", Description: "Elegant and simple HTTP library for Python"},
	{Name: "fastapi", Version: "latest", Description: "High performance, fast to code web framework for Python"},
	{Name: "flask", Version: "latest", Description: "A lightweight WSGI web application framework"},
	{Name: "pydantic", Version: "latest", Description: "Data validation using Python type hints"},
	{Name: "pytest", Version: "latest", Description: "Simple and powerful testing framework for Python"},
	{Name: "httpx", Version: "latest", Description: "Fully featured HTTP client for Python 3 with async support"},
}

var popularJSPackages = []PackageHTTPItem{
	{Name: "lodash", Version: "latest", Description: "Lodash modular utilities for arrays, numbers, objects, and strings"},
	{Name: "axios", Version: "latest", Description: "Promise based HTTP client for node.js and the browser"},
	{Name: "express", Version: "latest", Description: "Fast, unopinionated, minimalist web framework for node"},
	{Name: "rxjs", Version: "latest", Description: "Reactive Extensions Library for JavaScript"},
	{Name: "dayjs", Version: "latest", Description: "Fast 2kB alternative to Moment.js with the same modern API"},
	{Name: "uuid", Version: "latest", Description: "RFC4122 UUID generator for JavaScript"},
	{Name: "three", Version: "latest", Description: "JavaScript 3D Library for WebGL"},
	{Name: "dotenv", Version: "latest", Description: "Loads environment variables from .env file"},
	{Name: "chalk", Version: "latest", Description: "Terminal string styling done right"},
	{Name: "commander", Version: "latest", Description: "Node.js command-line interfaces made easy"},
}

func (h *PackagesHandler) SearchPackages(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	if query == "" {
		query = strings.TrimSpace(r.URL.Query().Get("text"))
	}

	pkgMgr := "pypi"
	mgrParam := strings.ToLower(r.URL.Query().Get("mgr"))
	if mgrParam == "" {
		mgrParam = strings.ToLower(r.URL.Query().Get("manager"))
	}
	if mgrParam == "" {
		mgrParam = strings.ToLower(r.URL.Query().Get("language"))
	}

	if mgrParam == "npm" || mgrParam == "javascript" || mgrParam == "node" || mgrParam == "js" || mgrParam == "typescript" || mgrParam == "ts" {
		pkgMgr = "npm"
	}

	var results []PackageHTTPItem
	if query == "" {
		if pkgMgr == "npm" {
			results = popularJSPackages
		} else {
			results = popularPythonPackages
		}
	} else {
		if pkgMgr == "npm" {
			results = h.searchNPM(r.Context(), query)
		} else {
			results = h.searchPyPI(r.Context(), query)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(PackageHTTPResponse{
		Query:    query,
		Packages: results,
	})
}

func (h *PackagesHandler) searchNPM(ctx context.Context, query string) []PackageHTTPItem {
	var items []PackageHTTPItem
	qLower := strings.ToLower(query)

	for _, p := range popularJSPackages {
		if strings.Contains(strings.ToLower(p.Name), qLower) || strings.Contains(strings.ToLower(p.Description), qLower) {
			items = append(items, p)
		}
	}

	apiURL := fmt.Sprintf("https://registry.npmjs.org/-/v1/search?text=%s&size=15", url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err == nil {
		req.Header.Set("User-Agent", "LiveSync-Gateway/1.0")
		resp, err := h.httpClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var npmResp struct {
				Objects []struct {
					Package struct {
						Name        string `json:"name"`
						Version     string `json:"version"`
						Description string `json:"description"`
					} `json:"package"`
				} `json:"objects"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&npmResp); err == nil {
				for _, obj := range npmResp.Objects {
					p := obj.Package
					if p.Name == "" {
						continue
					}
					exists := false
					for _, existing := range items {
						if strings.EqualFold(existing.Name, p.Name) {
							exists = true
							break
						}
					}
					if !exists {
						items = append(items, PackageHTTPItem{
							Name:        p.Name,
							Version:     p.Version,
							Description: p.Description,
						})
					}
				}
			}
		}
	}

	if len(items) == 0 {
		items = append(items, PackageHTTPItem{
			Name:        query,
			Version:     "latest",
			Description: fmt.Sprintf("npm package candidate '%s'", query),
		})
	}

	if len(items) > 15 {
		items = items[:15]
	}
	return items
}

func (h *PackagesHandler) searchPyPI(ctx context.Context, query string) []PackageHTTPItem {
	var items []PackageHTTPItem
	qLower := strings.ToLower(query)

	for _, p := range popularPythonPackages {
		if strings.Contains(strings.ToLower(p.Name), qLower) || strings.Contains(strings.ToLower(p.Description), qLower) {
			items = append(items, p)
		}
	}

	apiURL := fmt.Sprintf("https://pypi.org/pypi/%s/json", url.PathEscape(query))
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err == nil {
		req.Header.Set("User-Agent", "LiveSync-Gateway/1.0")
		resp, err := h.httpClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var pypiResp struct {
				Info struct {
					Name    string `json:"name"`
					Version string `json:"version"`
					Summary string `json:"summary"`
				} `json:"info"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&pypiResp); err == nil {
				name := pypiResp.Info.Name
				if name == "" {
					name = query
				}
				exists := false
				for _, existing := range items {
					if strings.EqualFold(existing.Name, name) {
						exists = true
						break
					}
				}
				if !exists {
					items = append([]PackageHTTPItem{{
						Name:        name,
						Version:     pypiResp.Info.Version,
						Description: pypiResp.Info.Summary,
					}}, items...)
				}
			}
		}
	}

	if len(items) == 0 {
		items = append(items, PackageHTTPItem{
			Name:        query,
			Version:     "latest",
			Description: fmt.Sprintf("PyPI package candidate '%s'", query),
		})
	}

	if len(items) > 15 {
		items = items[:15]
	}
	return items
}
