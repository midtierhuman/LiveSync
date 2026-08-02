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
    const added = await this.redis.sadd(RedisDocumentStateService.docUsersKey(documentId), connectionId);
    const connDocsKey = RedisDocumentStateService.connDocsKey(connectionId);
    await this.redis.hset(connDocsKey, documentId, accessLevel);
    await this.redis.expire(connDocsKey, RedisDocumentStateService.CONN_KEY_TTL_SECONDS);
    return added > 0;
  }

  public async removeUserFromDocument(documentId: string, connectionId: string): Promise<boolean> {
    const removed = await this.redis.srem(RedisDocumentStateService.docUsersKey(documentId), connectionId);
    await this.redis.hdel(RedisDocumentStateService.connDocsKey(connectionId), documentId);
    return removed > 0;
  }

  public async getUserCount(documentId: string): Promise<number> {
    return await this.redis.scard(RedisDocumentStateService.docUsersKey(documentId));
  }

  public async getDocumentsForConnection(connectionId: string): Promise<Record<string, string>> {
    return await this.redis.hgetall(RedisDocumentStateService.connDocsKey(connectionId));
  }

  public async setContent(documentId: string, content: string): Promise<void> {
    await this.redis.set(RedisDocumentStateService.docContentKey(documentId), content);
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
}
