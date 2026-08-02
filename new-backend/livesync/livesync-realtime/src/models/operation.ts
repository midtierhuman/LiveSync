import type { OperationId } from './operationId';

/**
 * Base properties for collaborative editing operations in a CRDT system.
 */
export interface BaseOperation {
  /** Unique identifier for this operation (site ID + logical clock) */
  id: OperationId;
  /** Client-side revision number when this operation was generated */
  clientRevision: number;
  /** Server-side revision number assigned when accepted */
  serverRevision: number;
  /** Timestamp when created (client-side) */
  timestamp: string | Date;
}

/**
 * Insert operation: adds one or more characters at a specific position.
 */
export interface InsertOperation extends BaseOperation {
  type?: 'insert';
  position: number;
  text: string;
}

/**
 * Delete operation: removes one or more characters starting at a specific position.
 */
export interface DeleteOperation extends BaseOperation {
  type?: 'delete';
  position: number;
  length: number;
}

export type Operation = InsertOperation | DeleteOperation;

export function isInsertOperation(op: Operation): op is InsertOperation {
  return 'text' in op;
}

export function isDeleteOperation(op: Operation): op is DeleteOperation {
  return 'length' in op;
}
