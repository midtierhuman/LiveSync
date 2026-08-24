package services

import (
	"testing"
)

func TestDocumentBatchSaveItem_DeduplicationLogic(t *testing.T) {
	items := []DocumentBatchSaveItem{
		{ID: "doc-1", Content: "initial content", LastEditor: "user-1"},
		{ID: "doc-2", Content: "file 2 content", LastEditor: "user-2"},
		{ID: "doc-1", Content: "latest modified content", LastEditor: "user-1-edit"},
	}

	latestMap := make(map[string]DocumentBatchSaveItem)
	for _, item := range items {
		if item.ID != "" {
			latestMap[item.ID] = item
		}
	}

	if len(latestMap) != 2 {
		t.Fatalf("expected 2 unique documents after deduplication, got %d", len(latestMap))
	}

	if latestMap["doc-1"].Content != "latest modified content" {
		t.Fatalf("expected latest content for doc-1, got %q", latestMap["doc-1"].Content)
	}

	if latestMap["doc-1"].LastEditor != "user-1-edit" {
		t.Fatalf("expected latest editor 'user-1-edit', got %q", latestMap["doc-1"].LastEditor)
	}
}
