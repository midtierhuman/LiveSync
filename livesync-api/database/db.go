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

	config.MaxConns = 25
	config.MinConns = 2
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	var pool *pgxpool.Pool
	var pingErr error

	// Retry connection up to 10 times for container startup synchronization
	for i := 0; i < 10; i++ {
		pool, err = pgxpool.NewWithConfig(ctx, config)
		if err == nil {
			pingErr = pool.Ping(ctx)
			if pingErr == nil {
				log.Println("✅ Connected to PostgreSQL database pool successfully.")
				return &DB{Pool: pool}, nil
			}
			pool.Close()
		}
		log.Printf("⏳ Waiting for PostgreSQL database to be ready (attempt %d/10)...", i+1)
		time.Sleep(2 * time.Second)
	}

	return nil, fmt.Errorf("failed to connect to PostgreSQL after retries: %v", pingErr)
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
