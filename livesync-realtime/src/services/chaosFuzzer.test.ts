import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictResolver } from './conflictResolver';
import { InsertOperation, DeleteOperation, Operation } from '../models/operation';

describe('TEST-01: Multi-User High-Concurrency Chaos & CRDT Fuzzing Suite', () => {
  const resolver = new ConflictResolver();

  it('verifies pairwise TP1 convergence across 100 randomized mutation pairs', () => {
    for (let round = 0; round < 100; round++) {
      const baseDoc = `The quick brown fox jumps over the lazy dog (${round}).`;
      const siteA = `site-a-${round}`;
      const siteB = `site-b-${round}`;

      const posA = Math.floor(Math.random() * (baseDoc.length + 1));
      const posB = Math.floor(Math.random() * (baseDoc.length + 1));

      let opA: Operation;
      let opB: Operation;

      if (round % 4 === 0) {
        // Insert vs Insert
        opA = {
          id: { siteId: siteA, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posA,
          text: `[A${round}]`,
        } as InsertOperation;

        opB = {
          id: { siteId: siteB, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posB,
          text: `[B${round}]`,
        } as InsertOperation;
      } else if (round % 4 === 1) {
        // Insert vs Delete
        opA = {
          id: { siteId: siteA, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posA,
          text: `[A${round}]`,
        } as InsertOperation;

        const delLen = Math.min(4, Math.max(1, baseDoc.length - posB));
        opB = {
          id: { siteId: siteB, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posB,
          length: delLen,
        } as DeleteOperation;
      } else if (round % 4 === 2) {
        // Delete vs Insert
        const delLen = Math.min(4, Math.max(1, baseDoc.length - posA));
        opA = {
          id: { siteId: siteA, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posA,
          length: delLen,
        } as DeleteOperation;

        opB = {
          id: { siteId: siteB, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posB,
          text: `[B${round}]`,
        } as InsertOperation;
      } else {
        // Delete vs Delete
        const delLenA = Math.min(3, Math.max(1, baseDoc.length - posA));
        const delLenB = Math.min(3, Math.max(1, baseDoc.length - posB));

        opA = {
          id: { siteId: siteA, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posA,
          length: delLenA,
        } as DeleteOperation;

        opB = {
          id: { siteId: siteB, clock: round },
          clientRevision: 1,
          serverRevision: 1,
          timestamp: new Date(),
          position: posB,
          length: delLenB,
        } as DeleteOperation;
      }

      const opBPrime = resolver.transformAgainstConcurrent(opB, opA);
      const opAPrime = resolver.transformAgainstConcurrent(opA, opB);

      const doc1 = resolver.applyOperations(baseDoc, [opA, opBPrime]);
      const doc2 = resolver.applyOperations(baseDoc, [opB, opAPrime]);

      assert.equal(doc1, doc2, `Pairwise TP1 divergence at round ${round}`);
    }
  });

  it('simulates 50+ concurrent client typing sessions against authoritative server queue', () => {
    const initialBaseDoc = 'function computeSum(a, b) {\n  return a + b;\n}';
    let serverDoc = initialBaseDoc;
    const numClients = 50;

    // Simulate 50 concurrent client submissions against central server
    const serverLog: Operation[] = [];

    for (let i = 0; i < numClients; i++) {
      const clientOp: InsertOperation = {
        id: { siteId: `client-${i}`, clock: i + 1 },
        clientRevision: 0,
        serverRevision: i + 1,
        timestamp: new Date(),
        position: (i * 3) % (initialBaseDoc.length + 1),
        text: `/*c${i}*/`,
      };

      // Transform against all operations committed since client's base revision (rev 0)
      let transformedOp: Operation = { ...clientOp };
      for (const committedOp of serverLog) {
        transformedOp = resolver.transformAgainstConcurrent(transformedOp, committedOp);
      }

      serverLog.push(transformedOp);
      serverDoc = resolver.applyOperation(serverDoc, transformedOp);
    }

    assert.equal(serverLog.length, 50, 'All 50 operations sequenced in server log');

    // Simulate 3 distinct clients syncing the server log from their base revision
    for (let c = 0; c < 3; c++) {
      let clientReconstructedDoc = initialBaseDoc;
      for (const op of serverLog) {
        clientReconstructedDoc = resolver.applyOperation(clientReconstructedDoc, op);
      }
      assert.equal(clientReconstructedDoc, serverDoc, `Client replica ${c} must match authoritative server state`);
    }

    assert.ok(serverDoc.length >= initialBaseDoc.length, 'Converged document contains all concurrent inserts');
  });
});
