package database

import (
	"context"
	"errors"
	"testing"
)

func TestDB_ExecuteWithRetry_SuccessFirstTry(t *testing.T) {
	db := &DB{}
	attempts := 0

	err := db.ExecuteWithRetry(context.Background(), 3, func(ctx context.Context) error {
		attempts++
		return nil
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if attempts != 1 {
		t.Fatalf("expected 1 attempt, got %d", attempts)
	}
}

func TestDB_ExecuteWithRetry_SuccessAfterTransientError(t *testing.T) {
	db := &DB{}
	attempts := 0

	err := db.ExecuteWithRetry(context.Background(), 3, func(ctx context.Context) error {
		attempts++
		if attempts < 2 {
			return errors.New("transient network dropout")
		}
		return nil
	})

	if err != nil {
		t.Fatalf("expected retry success, got %v", err)
	}
	if attempts != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
}

func TestDB_ExecuteWithRetry_Exhaustion(t *testing.T) {
	db := &DB{}
	attempts := 0

	err := db.ExecuteWithRetry(context.Background(), 3, func(ctx context.Context) error {
		attempts++
		return errors.New("persistent db failure")
	})

	if err == nil || err.Error() != "persistent db failure" {
		t.Fatalf("expected persistent failure, got %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 attempts before exhaustion, got %d", attempts)
	}
}
