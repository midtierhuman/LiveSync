import { Operation, InsertOperation, DeleteOperation, isInsertOperation, isDeleteOperation } from '../models/operation';
import { compareOperationId } from '../models/operationId';

/**
 * Implements mathematically sound conflict-free document state transformation using
 * Operational Transformation (OT) and CRDT principles.
 * Ensures Transformation Property 1 (TP1) convergence across all distributed replicas:
 * Apply(Apply(S, Op1), Transform(Op2, Op1)) === Apply(Apply(S, Op2), Transform(Op1, Op2))
 */
export class ConflictResolver {
  /**
   * Applies a single operation to document content with safe boundary clamping.
   */
  public applyOperation(content: string, operation: Operation): string {
    if (!operation) return content;
    if (isInsertOperation(operation)) {
      return this.applyInsert(content, operation);
    } else if (isDeleteOperation(operation)) {
      return this.applyDelete(content, operation);
    } else {
      throw new Error(`Unknown operation type: ${JSON.stringify(operation)}`);
    }
  }

  /**
   * Applies a sequence of operations sequentially to reconstruct final state.
   */
  public applyOperations(content: string, operations: Operation[]): string {
    return operations.reduce((acc, op) => this.applyOperation(acc, op), content);
  }

  /**
   * Transforms baseTx against a concurrentTx that was generated concurrently.
   */
  public transformAgainstConcurrent(baseTx: Operation, concurrentTx: Operation): Operation {
    if (isInsertOperation(baseTx) && isInsertOperation(concurrentTx)) {
      return this.transformInsertAgainstInsert(baseTx, concurrentTx);
    } else if (isInsertOperation(baseTx) && isDeleteOperation(concurrentTx)) {
      return this.transformInsertAgainstDelete(baseTx, concurrentTx);
    } else if (isDeleteOperation(baseTx) && isInsertOperation(concurrentTx)) {
      return this.transformDeleteAgainstInsert(baseTx, concurrentTx);
    } else if (isDeleteOperation(baseTx) && isDeleteOperation(concurrentTx)) {
      return this.transformDeleteAgainstDelete(baseTx, concurrentTx);
    } else {
      throw new Error('Unknown operation combination');
    }
  }

  /**
   * Insert vs Insert:
   * If concurrent insert is before base insert, base position is shifted right.
   * If positions are identical, deterministic tie-breaking via OperationId (clock + siteId) determines
   * which insert shifts right.
   */
  private transformInsertAgainstInsert(baseInsert: InsertOperation, concurrentInsert: InsertOperation): InsertOperation {
    if (concurrentInsert.position < baseInsert.position) {
      return { ...baseInsert, position: baseInsert.position + concurrentInsert.text.length };
    }

    if (baseInsert.position === concurrentInsert.position) {
      // Deterministic tie-breaking: lower ID wins left position, higher ID shifts right
      if (compareOperationId(concurrentInsert.id, baseInsert.id) < 0) {
        return { ...baseInsert, position: baseInsert.position + concurrentInsert.text.length };
      }
      return { ...baseInsert };
    }

    return { ...baseInsert };
  }

  /**
   * Insert vs Delete:
   * - If insert position <= delete start: unaffected.
   * - If insert position > delete end: shifted left by delete length.
   * - If insert position is inside the deleted span: collapses to delete start with empty string.
   */
  private transformInsertAgainstDelete(baseInsert: InsertOperation, concurrentDelete: DeleteOperation): InsertOperation {
    const deleteStart = concurrentDelete.position;
    const deleteEnd = concurrentDelete.position + concurrentDelete.length;

    if (baseInsert.position <= deleteStart) {
      return { ...baseInsert };
    }

    if (baseInsert.position >= deleteEnd) {
      return { ...baseInsert, position: baseInsert.position - concurrentDelete.length };
    }

    // Insert happened inside deleted region: collapse to deleteStart with empty text to satisfy TP1
    return { ...baseInsert, position: deleteStart, text: '' };
  }

  /**
   * Delete vs Insert:
   * - If insert position <= delete start: delete is shifted right by insert length.
   * - If insert position >= delete end: delete is unaffected.
   * - If insert position is inside the deleted span: delete length is extended to consume concurrent insert.
   */
  private transformDeleteAgainstInsert(baseDelete: DeleteOperation, concurrentInsert: InsertOperation): DeleteOperation {
    const deleteStart = baseDelete.position;
    const deleteEnd = baseDelete.position + baseDelete.length;

    if (concurrentInsert.position <= deleteStart) {
      return { ...baseDelete, position: baseDelete.position + concurrentInsert.text.length };
    }

    if (concurrentInsert.position >= deleteEnd) {
      return { ...baseDelete };
    }

    // Insert is strictly inside deleted region: expand delete length to consume the region
    return { ...baseDelete, length: baseDelete.length + concurrentInsert.text.length };
  }

  /**
   * Delete vs Delete:
   * Handles non-overlapping, partially overlapping, and fully nested deletions.
   */
  private transformDeleteAgainstDelete(baseDelete: DeleteOperation, concurrentDelete: DeleteOperation): DeleteOperation {
    const baseStart = baseDelete.position;
    const baseEnd = baseDelete.position + baseDelete.length;
    const concurrentStart = concurrentDelete.position;
    const concurrentEnd = concurrentDelete.position + concurrentDelete.length;

    // Case 1: Base is completely before concurrent
    if (baseEnd <= concurrentStart) {
      return { ...baseDelete };
    }

    // Case 2: Base is completely after concurrent
    if (baseStart >= concurrentEnd) {
      return { ...baseDelete, position: baseDelete.position - concurrentDelete.length };
    }

    // Case 3: Partial or full overlap
    const overlap = Math.max(0, Math.min(baseEnd, concurrentEnd) - Math.max(baseStart, concurrentStart));
    const newLength = Math.max(0, baseDelete.length - overlap);

    let newPosition = baseStart;
    if (baseStart >= concurrentStart) {
      newPosition = concurrentStart;
    }

    return {
      ...baseDelete,
      position: newPosition,
      length: newLength,
    };
  }

  private applyInsert(content: string, insert: InsertOperation): string {
    if (!insert.text) return content;
    const safePos = Math.max(0, Math.min(insert.position, content.length));
    return content.slice(0, safePos) + insert.text + content.slice(safePos);
  }

  private applyDelete(content: string, deleteOp: DeleteOperation): string {
    if (!deleteOp.length || deleteOp.length <= 0) return content;
    const start = Math.max(0, Math.min(deleteOp.position, content.length));
    const actualLength = Math.min(deleteOp.length, content.length - start);
    if (actualLength <= 0) return content;
    return content.slice(0, start) + content.slice(start + actualLength);
  }
}
