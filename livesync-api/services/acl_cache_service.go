package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	DefaultACLCacheTTL = 15 * time.Minute
	ACLDocPrefix       = "livesync:acl:doc:"
	ACLFolderPrefix    = "livesync:acl:ws:"
)

// ACLEngine defines the cache-aside interface for high-speed permission lookups.
type ACLEngine interface {
	GetDocumentAccess(ctx context.Context, docId, userId string) (string, bool, error)
	SetDocumentAccess(ctx context.Context, docId, userId, accessLevel string, ttl time.Duration) error
	InvalidateDocumentAccess(ctx context.Context, docId, userId string) error
	InvalidateAllDocumentAccess(ctx context.Context, docId string) error

	GetFolderAccess(ctx context.Context, folderId, userId string) (string, bool, error)
	SetFolderAccess(ctx context.Context, folderId, userId, accessLevel string, ttl time.Duration) error
	InvalidateFolderAccess(ctx context.Context, folderId, userId string) error
	InvalidateAllFolderAccess(ctx context.Context, folderId string) error
}

type RedisACLCacheService struct {
	rdb *redis.Client
}

func NewRedisACLCacheService(rdb *redis.Client) *RedisACLCacheService {
	return &RedisACLCacheService{rdb: rdb}
}

func (s *RedisACLCacheService) SetRedisClient(rdb *redis.Client) {
	s.rdb = rdb
}

func (s *RedisACLCacheService) docKey(docId, userId string) string {
	return fmt.Sprintf("%s%s:%s", ACLDocPrefix, docId, userId)
}

func (s *RedisACLCacheService) folderKey(folderId, userId string) string {
	return fmt.Sprintf("%s%s:%s", ACLFolderPrefix, folderId, userId)
}

func (s *RedisACLCacheService) GetDocumentAccess(ctx context.Context, docId, userId string) (string, bool, error) {
	if s.rdb == nil || docId == "" || userId == "" {
		return "", false, nil
	}

	val, err := s.rdb.Get(ctx, s.docKey(docId, userId)).Result()
	if err != nil {
		if err == redis.Nil {
			return "", false, nil
		}
		// Graceful degradation on Redis failure
		log.Printf("⚠️ Warning: Redis ACL cache get error for doc %s user %s: %v", docId, userId, err)
		return "", false, nil
	}

	return val, true, nil
}

func (s *RedisACLCacheService) SetDocumentAccess(ctx context.Context, docId, userId, accessLevel string, ttl time.Duration) error {
	if s.rdb == nil || docId == "" || userId == "" {
		return nil
	}
	if ttl <= 0 {
		ttl = DefaultACLCacheTTL
	}

	err := s.rdb.Set(ctx, s.docKey(docId, userId), accessLevel, ttl).Err()
	if err != nil {
		log.Printf("⚠️ Warning: Redis ACL cache set error for doc %s user %s: %v", docId, userId, err)
	}
	return err
}

func (s *RedisACLCacheService) InvalidateDocumentAccess(ctx context.Context, docId, userId string) error {
	if s.rdb == nil || docId == "" {
		return nil
	}
	if userId != "" {
		return s.rdb.Del(ctx, s.docKey(docId, userId)).Err()
	}
	return s.InvalidateAllDocumentAccess(ctx, docId)
}

func (s *RedisACLCacheService) InvalidateAllDocumentAccess(ctx context.Context, docId string) error {
	if s.rdb == nil || docId == "" {
		return nil
	}
	pattern := fmt.Sprintf("%s%s:*", ACLDocPrefix, docId)
	return s.deleteByPattern(ctx, pattern)
}

func (s *RedisACLCacheService) GetFolderAccess(ctx context.Context, folderId, userId string) (string, bool, error) {
	if s.rdb == nil || folderId == "" || userId == "" {
		return "", false, nil
	}

	val, err := s.rdb.Get(ctx, s.folderKey(folderId, userId)).Result()
	if err != nil {
		if err == redis.Nil {
			return "", false, nil
		}
		log.Printf("⚠️ Warning: Redis ACL cache get error for folder %s user %s: %v", folderId, userId, err)
		return "", false, nil
	}

	return val, true, nil
}

func (s *RedisACLCacheService) SetFolderAccess(ctx context.Context, folderId, userId, accessLevel string, ttl time.Duration) error {
	if s.rdb == nil || folderId == "" || userId == "" {
		return nil
	}
	if ttl <= 0 {
		ttl = DefaultACLCacheTTL
	}

	err := s.rdb.Set(ctx, s.folderKey(folderId, userId), accessLevel, ttl).Err()
	if err != nil {
		log.Printf("⚠️ Warning: Redis ACL cache set error for folder %s user %s: %v", folderId, userId, err)
	}
	return err
}

func (s *RedisACLCacheService) InvalidateFolderAccess(ctx context.Context, folderId, userId string) error {
	if s.rdb == nil || folderId == "" {
		return nil
	}
	if userId != "" {
		return s.rdb.Del(ctx, s.folderKey(folderId, userId)).Err()
	}
	return s.InvalidateAllFolderAccess(ctx, folderId)
}

func (s *RedisACLCacheService) InvalidateAllFolderAccess(ctx context.Context, folderId string) error {
	if s.rdb == nil || folderId == "" {
		return nil
	}
	pattern := fmt.Sprintf("%s%s:*", ACLFolderPrefix, folderId)
	return s.deleteByPattern(ctx, pattern)
}

func (s *RedisACLCacheService) deleteByPattern(ctx context.Context, pattern string) error {
	var cursor uint64
	var totalKeys []string

	for {
		keys, nextCursor, err := s.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			log.Printf("⚠️ Warning: Redis ACL scan error for pattern %s: %v", pattern, err)
			return err
		}
		totalKeys = append(totalKeys, keys...)
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	if len(totalKeys) > 0 {
		if err := s.rdb.Del(ctx, totalKeys...).Err(); err != nil {
			log.Printf("⚠️ Warning: Redis ACL batch delete error: %v", err)
			return err
		}
	}
	return nil
}
