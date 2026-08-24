package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func Connect(ctx context.Context, connString string) (*DB, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %w", err)
	}

	// Auto-scaling connection pool settings with idle reclamation (PERF-09)
	config.MaxConns = 50
	config.MinConns = 5
	config.MaxConnLifetime = 60 * time.Minute
	config.MaxConnIdleTime = 10 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	var pool *pgxpool.Pool
	var pingErr error

	// Retry connection up to 10 times for container startup synchronization
	for i := 0; i < 10; i++ {
		pool, err = pgxpool.NewWithConfig(ctx, config)
		if err == nil {
			pingErr = pool.Ping(ctx)
			if pingErr == nil {
				log.Println("✅ Connected to PostgreSQL database pool successfully with health check & auto-reclaim.")
				return &DB{Pool: pool}, nil
			}
			pool.Close()
		}
		log.Printf("⏳ Waiting for PostgreSQL database to be ready (attempt %d/10)...", i+1)
		time.Sleep(2 * time.Second)
	}

	return nil, fmt.Errorf("failed to connect to PostgreSQL after retries: %v", pingErr)
}

// ExecuteWithRetry executes a database operation with exponential backoff on transient errors (PERF-09)
func (db *DB) ExecuteWithRetry(ctx context.Context, maxAttempts int, op func(ctx context.Context) error) error {
	var err error
	backoff := 50 * time.Millisecond

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err = op(ctx)
		if err == nil {
			return nil
		}

		if attempt == maxAttempts {
			break
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
			backoff *= 2
			if backoff > 1*time.Second {
				backoff = 1 * time.Second
			}
		}
	}

	return err
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
