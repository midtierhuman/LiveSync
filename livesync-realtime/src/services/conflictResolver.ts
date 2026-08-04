import { Operation, InsertOperation, DeleteOperation, isInsertOperation, isDeleteOperation } from '../models/operation';
import { compareOperationId } from '../models/operationId';

/**
 * Implements conflict-free document state management using CRDT (Conflict-free Replicated Data Type) principles.
 * Handles operation transformation, application, and composition to ensure consistency across replicas.
 * This class is stateless and fully testable — it should not depend on any external services.
 */
export class ConflictResolver {
  /**
   * Applies a single operation to document content.
   * Handles both Insert and Delete operations with proper position adjustment.
   */
  public applyOperation(content: string, operation: Operation): string {
    if (isInsertOperation(operation)) {
      return this.applyInsert(content, operation);
    } else if (isDeleteOperation(operation)) {
      return this.applyDelete(content, operation);
    } else {
      throw new Error(`Unknown operation type: ${JSON.stringify(operation)}`);
    }
  }

  /**
   * Applies a sequence of operations to the document, reconstructing its final state.
   */
  public applyOperations(content: string, operations: Operation[]): string {
    return operations.reduce((acc, op) => this.applyOperation(acc, op), content);
  }

  /**
   * Transforms two operations that were generated concurrently (independent of each other)
   * so they can be applied in either order and produce the same final result.
   */
  public transformAgainstConcurrent(op1: Operation, op2: Operation): Operation {
    return this.transformInternal(op1, op2);
  }

  private transformInternal(baseTx: Operation, concurrentTx: Operation): Operation {
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

  private transformInsertAgainstInsert(baseInsert: InsertOperation, concurrentInsert: InsertOperation): InsertOperation {
    if (baseInsert.position === concurrentInsert.position) {
      if (compareOperationId(concurrentInsert.id, baseInsert.id) < 0) {
        return { ...baseInsert, position: baseInsert.position + concurrentInsert.text.length };
      }
      return { ...baseInsert };
    }

    if (concurrentInsert.position < baseInsert.position) {
      return { ...baseInsert, position: baseInsert.position + concurrentInsert.text.length };
    }

    return { ...baseInsert };
  }

  private transformInsertAgainstDelete(baseInsert: InsertOperation, concurrentDelete: DeleteOperation): InsertOperation {
    const deleteStart = concurrentDelete.position;
    const deleteEnd = concurrentDelete.position + concurrentDelete.length;

    if (baseInsert.position < deleteStart) {
      return { ...baseInsert };
    }

    if (baseInsert.position >= deleteStart && baseInsert.position <= deleteEnd) {
      return { ...baseInsert, position: deleteStart };
    }

    return { ...baseInsert, position: baseInsert.position - concurrentDelete.length };
  }

  private transformDeleteAgainstInsert(baseDelete: DeleteOperation, concurrentInsert: InsertOperation): DeleteOperation {
    const deleteStart = baseDelete.position;
    const deleteEnd = baseDelete.position + baseDelete.length;

    if (concurrentInsert.position < deleteStart) {
      return { ...baseDelete, position: baseDelete.position + concurrentInsert.text.length };
    }

    if (concurrentInsert.position >= deleteStart && concurrentInsert.position <= deleteEnd) {
      return { ...baseDelete, length: baseDelete.length + concurrentInsert.text.length };
    }

    return { ...baseDelete };
  }

  private transformDeleteAgainstDelete(baseDelete: DeleteOperation, concurrentDelete: DeleteOperation): DeleteOperation {
    const baseStart = baseDelete.position;
    const baseEnd = baseDelete.position + baseDelete.length;
    const concurrentStart = concurrentDelete.position;
    const concurrentEnd = concurrentDelete.position + concurrentDelete.length;

    if (baseEnd <= concurrentStart) {
      return { ...baseDelete };
    }

    if (baseStart >= concurrentEnd) {
      return { ...baseDelete, position: baseDelete.position - concurrentDelete.length };
    }

    const beforeLength = Math.max(0, concurrentStart - baseStart);
    const afterLength = Math.max(0, baseEnd - concurrentEnd);
    const newPosition = baseStart < concurrentStart ? baseStart : concurrentStart;
    const newLength = beforeLength + afterLength;

    return {
      ...baseDelete,
      position: newPosition,
      length: Math.max(0, newLength),
    };
  }

  private applyInsert(content: string, insert: InsertOperation): string {
    if (insert.position < 0 || insert.position > content.length) {
      throw new Error(`Insert position ${insert.position} is out of bounds for content of length ${content.length}`);
    }
    return content.slice(0, insert.position) + insert.text + content.slice(insert.position);
  }

  private applyDelete(content: string, deleteOp: DeleteOperation): string {
    if (deleteOp.position < 0 || deleteOp.position > content.length) {
      throw new Error(`Delete position ${deleteOp.position} is out of bounds for content of length ${content.length}`);
    }
    const endPosition = Math.min(deleteOp.position + deleteOp.length, content.length);
    const actualLength = endPosition - deleteOp.position;
    if (actualLength <= 0) {
      return content;
    }
    return content.slice(0, deleteOp.position) + content.slice(deleteOp.position + actualLength);
  }
}
