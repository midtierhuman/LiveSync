package services

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	StreamKey     = "livesync:stream:document-saves"
	ConsumerGroup = "api-save-group"
	ConsumerName  = "api-consumer-1"
)

type DocumentSaveStreamConsumer struct {
	rdb             *redis.Client
	documentService *DocumentService
	groupCreated    bool
}

func NewDocumentSaveStreamConsumer(redisURL string, documentService *DocumentService) *DocumentSaveStreamConsumer {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("⚠️ Warning: failed to parse Redis URL (%s): %v. Using localhost default.", redisURL, err)
		opt = &redis.Options{Addr: "localhost:6379"}
	}

	rdb := redis.NewClient(opt)
	return &DocumentSaveStreamConsumer{
		rdb:             rdb,
		documentService: documentService,
	}
}

func (c *DocumentSaveStreamConsumer) GetRedisClient() *redis.Client {
	return c.rdb
}

func (c *DocumentSaveStreamConsumer) Start(ctx context.Context) {
	log.Println("🚀 Starting Redis Stream write-behind consumer for document saves...")

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🛑 Stopping Redis Stream consumer...")
			_ = c.rdb.Close()
			return
		case <-ticker.C:
			c.pollSaveEvents(ctx)
		}
	}
}

func (c *DocumentSaveStreamConsumer) ensureConsumerGroup(ctx context.Context) {
	if c.groupCreated {
		return
	}

	err := c.rdb.XGroupCreateMkStream(ctx, StreamKey, ConsumerGroup, "0-0").Err()
	if err != nil {
		if strings.Contains(err.Error(), "BUSYGROUP") {
			c.groupCreated = true
		}
	} else {
		log.Printf("✅ Created Redis Stream consumer group '%s' on '%s'", ConsumerGroup, StreamKey)
		c.groupCreated = true
	}
}

func (c *DocumentSaveStreamConsumer) pollSaveEvents(ctx context.Context) {
	c.ensureConsumerGroup(ctx)

	var streams []redis.XStream
	var err error

	if c.groupCreated {
		streams, err = c.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    ConsumerGroup,
			Consumer: ConsumerName,
			Streams:  []string{StreamKey, ">"},
			Count:    50,
			Block:    500 * time.Millisecond,
		}).Result()

		if err != nil && err != redis.Nil {
			c.groupCreated = false
		}
	}

	if len(streams) == 0 {
		streams, err = c.rdb.XRead(ctx, &redis.XReadArgs{
			Streams: []string{StreamKey, "0-0"},
			Count:   50,
		}).Result()
		if err != nil && err != redis.Nil {
			return
		}
	}

	if len(streams) == 0 {
		return
	}

	for _, stream := range streams {
		for _, msg := range stream.Messages {
			var (
				documentId string
				content    string
				userId     string
			)

			if val, ok := msg.Values["documentId"].(string); ok {
				documentId = val
			}
			if val, ok := msg.Values["content"].(string); ok {
				content = val
			}
			if val, ok := msg.Values["userId"].(string); ok {
				userId = val
			}

			if documentId != "" && content != "" {
				updated, err := c.documentService.UpdateContentInternal(ctx, documentId, content, userId)
				if err == nil && updated {
					log.Printf("[Redis Stream Consumer] Flushed document %s to PostgreSQL (MessageId: %s)", documentId, msg.ID)
				}
			}

			if c.groupCreated {
				_ = c.rdb.XAck(ctx, StreamKey, ConsumerGroup, msg.ID).Err()
			}
			// Delete processed message from Redis stream to prevent unbounded stream growth
			_ = c.rdb.XDel(ctx, StreamKey, msg.ID).Err()
		}
	}
}
