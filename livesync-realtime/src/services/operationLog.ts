import Redis from 'ioredis';
import type { Operation } from '../models/operation';

export interface DocumentSnapshot {
  revision: number;
  content: string;
  timestamp: number;
}

export interface IOperationLog {
  appendOperation(documentId: string, operation: Operation): Promise<void>;
  appendOperationAtomically(documentId: string, operation: Omit<Operation, 'serverRevision'>): Promise<Operation>;
  getOperationsSince(documentId: string, fromRevision: number): Promise<Operation[]>;
  getAllOperations(documentId: string): Promise<Operation[]>;
  getCurrentRevision(documentId: string): Promise<number>;
  deleteOperations(documentId: string): Promise<void>;
  saveSnapshot(documentId: string, revision: number, content: string): Promise<void>;
  getSnapshot(documentId: string): Promise<DocumentSnapshot | null>;
  pruneOperationsOlderThan(documentId: string, minKeepRevision: number): Promise<number>;
}

export class RedisOperationLog implements IOperationLog {
  private static readonly OperationLogKeyPrefix = 'doc:operations:';
  private static readonly CurrentRevisionKeyPrefix = 'doc:revision:';
  private static readonly SnapshotKeyPrefix = 'doc:snapshot:';

  constructor(private readonly redis: Redis) {}

  private getOperationLogKey(documentId: string): string {
    return `${RedisOperationLog.OperationLogKeyPrefix}${documentId}`;
  }

  private getCurrentRevisionKey(documentId: string): string {
    return `${RedisOperationLog.CurrentRevisionKeyPrefix}${documentId}`;
  }

  private getSnapshotKey(documentId: string): string {
    return `${RedisOperationLog.SnapshotKeyPrefix}${documentId}`;
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

  /**
   * Atomically increments the revision counter and appends the operation in one Lua script,
   * eliminating the TOCTOU race condition between getCurrentRevision and appendOperation.
   * Returns the operation with the assigned serverRevision.
   */
  public async appendOperationAtomically(
    documentId: string,
    operation: Omit<Operation, 'serverRevision'>
  ): Promise<Operation> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const operationKey = this.getOperationLogKey(documentId);
    const revisionKey = this.getCurrentRevisionKey(documentId);

    // Lua: atomically INCR revision, then ZADD the operation with that revision as score
    const luaScript = `
      local rev = redis.call('INCR', KEYS[1])
      local op = cjson.decode(ARGV[1])
      op['serverRevision'] = tonumber(rev)
      local json = cjson.encode(op)
      redis.call('ZADD', KEYS[2], rev, json)
      return rev
    `;

    const serverRevision = (await this.redis.eval(
      luaScript, 2, revisionKey, operationKey, JSON.stringify(operation)
    )) as number;

    return { ...(operation as Operation), serverRevision };
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
    const snapshotKey = this.getSnapshotKey(documentId);

    await this.redis.del(operationKey, revisionKey, snapshotKey);
  }

  public async saveSnapshot(documentId: string, revision: number, content: string): Promise<void> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const snapshotKey = this.getSnapshotKey(documentId);
    const data: DocumentSnapshot = {
      revision,
      content,
      timestamp: Date.now(),
    };

    await this.redis.set(snapshotKey, JSON.stringify(data));
  }

  public async getSnapshot(documentId: string): Promise<DocumentSnapshot | null> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }

    const snapshotKey = this.getSnapshotKey(documentId);
    const data = await this.redis.get(snapshotKey);
    if (!data) return null;

    try {
      return JSON.parse(data) as DocumentSnapshot;
    } catch {
      return null;
    }
  }

  public async pruneOperationsOlderThan(documentId: string, minKeepRevision: number): Promise<number> {
    if (!documentId || !documentId.trim()) {
      throw new Error('Document ID cannot be null or empty');
    }
    if (minKeepRevision <= 0) return 0;

    const operationKey = this.getOperationLogKey(documentId);
    // Remove all operations with revision < minKeepRevision
    const removedCount = await this.redis.zremrangebyscore(operationKey, '-inf', `(${minKeepRevision}`);
    return removedCount;
  }
}
