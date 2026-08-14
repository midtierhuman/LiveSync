import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictResolver } from './conflictResolver';
import { InsertOperation, DeleteOperation } from '../models/operation';

describe('ConflictResolver Mathematical Verification (TP1)', () => {
  const resolver = new ConflictResolver();

  it('verifies Insert vs Insert on identical positions converges (tie-breaking)', () => {
    const initialDoc = 'Hello World';

    const op1: InsertOperation = {
      id: { siteId: 'alice', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 5,
      text: ' Beautiful',
    };

    const op2: InsertOperation = {
      id: { siteId: 'bob', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 5,
      text: ' Amazing',
    };

    // Branch 1: op1 then op2 transformed against op1
    const op2Prime = resolver.transformAgainstConcurrent(op2, op1);
    const doc1 = resolver.applyOperations(initialDoc, [op1, op2Prime]);

    // Branch 2: op2 then op1 transformed against op2
    const op1Prime = resolver.transformAgainstConcurrent(op1, op2);
    const doc2 = resolver.applyOperations(initialDoc, [op2, op1Prime]);

    assert.equal(doc1, doc2, 'Both transformation sequences must converge to the same text');
  });

  it('verifies Insert vs Delete with overlap converges under TP1', () => {
    const initialDoc = 'ABCDEF';

    // op1 deletes "BCD" (pos 1, len 3)
    const op1: DeleteOperation = {
      id: { siteId: 'alice', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 1,
      length: 3,
    };

    // op2 concurrently inserts "xyz" at pos 2 (inside "BCD")
    const op2: InsertOperation = {
      id: { siteId: 'bob', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 2,
      text: 'xyz',
    };

    // Branch 1: op1 applied first
    const op2Prime = resolver.transformAgainstConcurrent(op2, op1);
    const doc1 = resolver.applyOperations(initialDoc, [op1, op2Prime]);

    // Branch 2: op2 applied first
    const op1Prime = resolver.transformAgainstConcurrent(op1, op2);
    const doc2 = resolver.applyOperations(initialDoc, [op2, op1Prime]);

    assert.equal(doc1, doc2, 'TP1 convergence must hold for concurrent insert inside delete span');
  });

  it('verifies Insert vs Delete on boundaries converges', () => {
    const initialDoc = 'ABCDEF';

    const op1: DeleteOperation = {
      id: { siteId: 'alice', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 1,
      length: 3,
    };

    // Insert at boundary start (pos 1)
    const op2: InsertOperation = {
      id: { siteId: 'bob', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 1,
      text: '123',
    };

    const op2Prime = resolver.transformAgainstConcurrent(op2, op1);
    const doc1 = resolver.applyOperations(initialDoc, [op1, op2Prime]);

    const op1Prime = resolver.transformAgainstConcurrent(op1, op2);
    const doc2 = resolver.applyOperations(initialDoc, [op2, op1Prime]);

    assert.equal(doc1, doc2, 'Boundary start insert vs delete must converge');
  });

  it('verifies Delete vs Delete partial and full overlap converges', () => {
    const initialDoc = 'ABCDEFGH';

    // Alice deletes [2, 6) -> "CDEF"
    const op1: DeleteOperation = {
      id: { siteId: 'alice', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 2,
      length: 4,
    };

    // Bob deletes [3, 6) -> "DEF"
    const op2: DeleteOperation = {
      id: { siteId: 'bob', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 3,
      length: 3,
    };

    const op2Prime = resolver.transformAgainstConcurrent(op2, op1);
    const doc1 = resolver.applyOperations(initialDoc, [op1, op2Prime]);

    const op1Prime = resolver.transformAgainstConcurrent(op1, op2);
    const doc2 = resolver.applyOperations(initialDoc, [op2, op1Prime]);

    assert.equal(doc1, 'ABGH');
    assert.equal(doc2, 'ABGH');
  });

  it('handles safe bounds clamping without throwing errors', () => {
    const doc = 'Hello';
    const outOfBoundsInsert: InsertOperation = {
      id: { siteId: 'alice', clock: 1 },
      clientRevision: 1,
      serverRevision: 2,
      timestamp: new Date(),
      position: 999,
      text: ' World',
    };

    const result = resolver.applyOperation(doc, outOfBoundsInsert);
    assert.equal(result, 'Hello World');

    const outOfBoundsDelete: DeleteOperation = {
      id: { siteId: 'alice', clock: 2 },
      clientRevision: 2,
      serverRevision: 3,
      timestamp: new Date(),
      position: 5,
      length: 50,
    };

    const deleteResult = resolver.applyOperation(result, outOfBoundsDelete);
    assert.equal(deleteResult, 'Hello');
  });
});
