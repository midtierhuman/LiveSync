/**
 * Unique identifier for an operation in CRDT-based conflict resolution.
 * Combines a site ID (per-client) with a logical clock to ensure global uniqueness and ordering.
 */
export interface OperationId {
  siteId: string;
  clock: number;
}

export function compareOperationId(a: OperationId, b: OperationId): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  // First compare by clock (logical timestamp)
  if (a.clock !== b.clock) {
    return a.clock - b.clock;
  }

  // If clocks are equal, use site ID for deterministic ordering
  return a.siteId.localeCompare(b.siteId);
}

export function formatOperationId(id: OperationId): string {
  return `(${id?.siteId}:${id?.clock})`;
}
