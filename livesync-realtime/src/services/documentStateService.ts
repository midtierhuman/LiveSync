import Redis from 'ioredis';
import { IOperationLog } from './operationLog';

export interface IDocumentStateService {
  addUserToDocument(documentId: string, connectionId: string, accessLevel: string): Promise<boolean>;
  removeUserFromDocument(documentId: string, connectionId: string): Promise<boolean>;
  getUserCount(documentId: string): Promise<number>;
  getDocumentsForConnection(connectionId: string): Promise<Record<string, string>>;
  setContent(documentId: string, content: string): Promise<void>;
  getContent(documentId: string): Promise<string | null>;
  deleteContent(documentId: string): Promise<void>;
  getAccess(connectionId: string, documentId: string): Promise<string | null>;
  removeConnection(connectionId: string): Promise<void>;
  setColor(connectionId: string, color: string): Promise<void>;
  getColor(connectionId: string): Promise<string | null>;
  getOperationLog(): IOperationLog;
}

export class RedisDocumentStateService implements IDocumentStateService {
  private static readonly CONN_KEY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

  constructor(
    private readonly redis: Redis,
    private readonly operationLog: IOperationLog
  ) {}

  private static docUsersKey(docId: string): string {
    return `livesync:doc:${docId}:users`;
  }

  private static docContentKey(docId: string): string {
    return `livesync:doc:${docId}:content`;
  }

  private static connDocsKey(connId: string): string {
    return `livesync:conn:${connId}:docs`;
  }

  private static connColorKey(connId: string): string {
    return `livesync:conn:${connId}:color`;
  }

  public async addUserToDocument(documentId: string, connectionId: string, accessLevel: string): Promise<boolean> {
    const docUsersKey = RedisDocumentStateService.docUsersKey(documentId);
    const added = await this.redis.sadd(docUsersKey, connectionId);
    // Refresh TTL on the document user set so orphaned sets eventually expire
    await this.redis.expire(docUsersKey, RedisDocumentStateService.CONN_KEY_TTL_SECONDS);
    const connDocsKey = RedisDocumentStateService.connDocsKey(connectionId);
    await this.redis.hset(connDocsKey, documentId, accessLevel);
    await this.redis.expire(connDocsKey, RedisDocumentStateService.CONN_KEY_TTL_SECONDS);
    return added > 0;
  }

  public async removeUserFromDocument(documentId: string, connectionId: string): Promise<boolean> {
    const docUsersKey = RedisDocumentStateService.docUsersKey(documentId);
    const removed = await this.redis.srem(docUsersKey, connectionId);
    await this.redis.hdel(RedisDocumentStateService.connDocsKey(connectionId), documentId);
    // Refresh TTL after removal so the set doesn't linger if it becomes empty later
    await this.redis.expire(docUsersKey, RedisDocumentStateService.CONN_KEY_TTL_SECONDS);
    return removed > 0;
  }

  public async getUserCount(documentId: string): Promise<number> {
    return await this.redis.scard(RedisDocumentStateService.docUsersKey(documentId));
  }

  public async getDocumentsForConnection(connectionId: string): Promise<Record<string, string>> {
    return await this.redis.hgetall(RedisDocumentStateService.connDocsKey(connectionId));
  }

  public async setContent(documentId: string, content: string): Promise<void> {
    await this.redis.set(
      RedisDocumentStateService.docContentKey(documentId),
      content,
      'EX',
      RedisDocumentStateService.CONN_KEY_TTL_SECONDS
    );
  }

  public async getContent(documentId: string): Promise<string | null> {
    return await this.redis.get(RedisDocumentStateService.docContentKey(documentId));
  }

  public async deleteContent(documentId: string): Promise<void> {
    await this.redis.del(RedisDocumentStateService.docContentKey(documentId));
  }

  public async getAccess(connectionId: string, documentId: string): Promise<string | null> {
    return await this.redis.hget(RedisDocumentStateService.connDocsKey(connectionId), documentId);
  }

  public async removeConnection(connectionId: string): Promise<void> {
    await this.redis.del(
      RedisDocumentStateService.connDocsKey(connectionId),
      RedisDocumentStateService.connColorKey(connectionId)
    );
  }

  public async setColor(connectionId: string, color: string): Promise<void> {
    await this.redis.set(
      RedisDocumentStateService.connColorKey(connectionId),
      color,
      'EX',
      RedisDocumentStateService.CONN_KEY_TTL_SECONDS
    );
  }

  public async getColor(connectionId: string): Promise<string | null> {
    return await this.redis.get(RedisDocumentStateService.connColorKey(connectionId));
  }

  public getOperationLog(): IOperationLog {
    return this.operationLog;
  }

  /**
   * Scan Redis for all active document user set keys.
   * Returns document IDs that have a user set in Redis.
   */
  public async getAllDocumentUserKeys(): Promise<string[]> {
    const pattern = 'livesync:doc:*:users';
    const documentIds: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        // Extract documentId from key pattern "livesync:doc:{docId}:users"
        const match = key.match(/^livesync:doc:(.+):users$/);
        if (match) {
          documentIds.push(match[1]);
        }
      }
    } while (cursor !== '0');
    return documentIds;
  }

  /**
   * Get all connection IDs that are members of a document's user set.
   */
  public async getDocumentUserMembers(documentId: string): Promise<string[]> {
    return await this.redis.smembers(RedisDocumentStateService.docUsersKey(documentId));
  }
}
