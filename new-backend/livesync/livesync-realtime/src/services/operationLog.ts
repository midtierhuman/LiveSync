import Redis from 'ioredis';
import type { Operation } from '../models/operation';

export interface IOperationLog {
  appendOperation(documentId: string, operation: Operation): Promise<void>;
  getOperationsSince(documentId: string, fromRevision: number): Promise<Operation[]>;
  getAllOperations(documentId: string): Promise<Operation[]>;
  getCurrentRevision(documentId: string): Promise<number>;
  deleteOperations(documentId: string): Promise<void>;
}

export class RedisOperationLog implements IOperationLog {
  private static readonly OperationLogKeyPrefix = 'doc:operations:';
  private static readonly CurrentRevisionKeyPrefix = 'doc:revision:';

  constructor(private readonly redis: Redis) {}

  private getOperationLogKey(documentId: string): string {
    return `${RedisOperationLog.OperationLogKeyPrefix}${documentId}`;
  }

  private getCurrentRevisionKey(documentId: string): string {
    return `${RedisOperationLog.CurrentRevisionKeyPrefix}${documentId}`;
  }

  public async appendOperation(documentId: string, operation: Operation): Promise<void> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }
    if (!operation) {
      throw new Error('Operation cannot be null');
    }

    const operationKey = this.getOperationLogKey(documentId);
    const revisionKey = this.getCurrentRevisionKey(documentId);
    const json = JSON.stringify(operation);

    const pipeline = this.redis.pipeline();
    pipeline.zadd(operationKey, operation.serverRevision, json);
    pipeline.set(revisionKey, operation.serverRevision.toString());

    await pipeline.exec();
  }

  public async getOperationsSince(documentId: string, fromRevision: number): Promise<Operation[]> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const operationKey = this.getOperationLogKey(documentId);
    const minScore = `(${fromRevision}`;
    const entries = await this.redis.zrangebyscore(operationKey, minScore, '+inf');

    return entries
      .map((entry: string): Operation | null => {
        try {
          return JSON.parse(entry) as Operation;
        } catch {
          return null;
        }
      })
      .filter((op: Operation | null): op is Operation => op !== null);
  }

  public async getAllOperations(documentId: string): Promise<Operation[]> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const operationKey = this.getOperationLogKey(documentId);
    const entries = await this.redis.zrangebyscore(operationKey, 0, '+inf');

    return entries
      .map((entry: string): Operation | null => {
        try {
          return JSON.parse(entry) as Operation;
        } catch {
          return null;
        }
      })
      .filter((op: Operation | null): op is Operation => op !== null);
  }

  public async getCurrentRevision(documentId: string): Promise<number> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const revisionKey = this.getCurrentRevisionKey(documentId);
    const value = await this.redis.get(revisionKey);
    if (!value) return 0;
    const rev = parseInt(value, 10);
    return isNaN(rev) ? 0 : rev;
  }

  public async deleteOperations(documentId: string): Promise<void> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const operationKey = this.getOperationLogKey(documentId);
    const revisionKey = this.getCurrentRevisionKey(documentId);

    await this.redis.del(operationKey, revisionKey);
  }
}
