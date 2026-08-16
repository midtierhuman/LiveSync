package services

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func setupTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	s, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	rdb := redis.NewClient(&redis.Options{
		Addr: s.Addr(),
	})
	return s, rdb
}

func TestRedisACLCacheService_DocumentAccess(t *testing.T) {
	s, rdb := setupTestRedis(t)
	defer s.Close()
	defer rdb.Close()

	ctx := context.Background()
	acl := NewRedisACLCacheService(rdb)

	docID := "doc-123"
	userID := "user-456"

	// 1. Initial Cache Miss
	val, hit, err := acl.GetDocumentAccess(ctx, docID, userID)
	if err != nil {
		t.Fatalf("unexpected error on get: %v", err)
	}
	if hit {
		t.Fatalf("expected cache miss, got hit with val %q", val)
	}

	// 2. Set Cache
	err = acl.SetDocumentAccess(ctx, docID, userID, "Edit", 5*time.Minute)
	if err != nil {
		t.Fatalf("failed to set access: %v", err)
	}

	// 3. Cache Hit
	val, hit, err = acl.GetDocumentAccess(ctx, docID, userID)
	if err != nil {
		t.Fatalf("unexpected error on get: %v", err)
	}
	if !hit || val != "Edit" {
		t.Fatalf("expected cache hit with val 'Edit', got hit=%v val=%q", hit, val)
	}

	// 4. Targeted Invalidation
	err = acl.InvalidateDocumentAccess(ctx, docID, userID)
	if err != nil {
		t.Fatalf("failed to invalidate: %v", err)
	}

	val, hit, err = acl.GetDocumentAccess(ctx, docID, userID)
	if err != nil {
		t.Fatalf("unexpected error on get: %v", err)
	}
	if hit {
		t.Fatalf("expected cache miss after invalidation, got hit=%v val=%q", hit, val)
	}
}

func TestRedisACLCacheService_InvalidateAllDocumentAccess(t *testing.T) {
	s, rdb := setupTestRedis(t)
	defer s.Close()
	defer rdb.Close()

	ctx := context.Background()
	acl := NewRedisACLCacheService(rdb)

	docID := "doc-multi"
	user1 := "user-1"
	user2 := "user-2"

	_ = acl.SetDocumentAccess(ctx, docID, user1, "Edit", 5*time.Minute)
	_ = acl.SetDocumentAccess(ctx, docID, user2, "View", 5*time.Minute)

	_, hit1, _ := acl.GetDocumentAccess(ctx, docID, user1)
	_, hit2, _ := acl.GetDocumentAccess(ctx, docID, user2)
	if !hit1 || !hit2 {
		t.Fatalf("expected both users to have cache hits")
	}

	// Invalidate all for docID
	err := acl.InvalidateAllDocumentAccess(ctx, docID)
	if err != nil {
		t.Fatalf("failed to invalidate all: %v", err)
	}

	_, hit1, _ = acl.GetDocumentAccess(ctx, docID, user1)
	_, hit2, _ = acl.GetDocumentAccess(ctx, docID, user2)
	if hit1 || hit2 {
		t.Fatalf("expected both users to have cache misses after InvalidateAllDocumentAccess")
	}
}

func TestRedisACLCacheService_FolderAccess(t *testing.T) {
	s, rdb := setupTestRedis(t)
	defer s.Close()
	defer rdb.Close()

	ctx := context.Background()
	acl := NewRedisACLCacheService(rdb)

	folderID := "folder-abc"
	userID := "user-xyz"

	_ = acl.SetFolderAccess(ctx, folderID, userID, "View", 5*time.Minute)

	val, hit, err := acl.GetFolderAccess(ctx, folderID, userID)
	if err != nil {
		t.Fatalf("unexpected error on folder get: %v", err)
	}
	if !hit || val != "View" {
		t.Fatalf("expected folder hit 'View', got hit=%v val=%q", hit, val)
	}

	_ = acl.InvalidateFolderAccess(ctx, folderID, userID)
	_, hit, _ = acl.GetFolderAccess(ctx, folderID, userID)
	if hit {
		t.Fatalf("expected folder cache miss after invalidation")
	}
}

func TestRedisACLCacheService_NilClientGracefulDegradation(t *testing.T) {
	ctx := context.Background()
	acl := NewRedisACLCacheService(nil)

	val, hit, err := acl.GetDocumentAccess(ctx, "doc-1", "user-1")
	if err != nil || hit || val != "" {
		t.Fatalf("expected graceful miss with nil client, got val=%q hit=%v err=%v", val, hit, err)
	}

	err = acl.SetDocumentAccess(ctx, "doc-1", "user-1", "Edit", 5*time.Minute)
	if err != nil {
		t.Fatalf("expected nil error on set with nil client, got %v", err)
	}

	err = acl.InvalidateDocumentAccess(ctx, "doc-1", "user-1")
	if err != nil {
		t.Fatalf("expected nil error on invalidate with nil client, got %v", err)
	}
}
