import { describe, it, expect } from 'vitest';

// Extract the cycle detection logic for testing
function wouldCreateCycle(source: string, target: string, edges: { source: string; target: string }[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const visited = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === source) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of adj.get(node) ?? []) {
      stack.push(next);
    }
  }
  return false;
}

describe('DAG cycle detection', () => {
  it('allows valid DAG edge', () => {
    const edges = [{ source: 'A', target: 'B' }];
    expect(wouldCreateCycle('B', 'C', edges)).toBe(false);
  });

  it('detects direct cycle', () => {
    const edges = [{ source: 'A', target: 'B' }];
    // Adding B→A would create A→B→A cycle
    expect(wouldCreateCycle('B', 'A', edges)).toBe(true);
  });

  it('detects indirect cycle', () => {
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];
    // Adding C→A would create A→B→C→A cycle
    expect(wouldCreateCycle('C', 'A', edges)).toBe(true);
  });

  it('allows parallel paths (diamond)', () => {
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'B', target: 'D' },
    ];
    // C→D is fine, no cycle
    expect(wouldCreateCycle('C', 'D', edges)).toBe(false);
  });

  it('handles empty graph', () => {
    expect(wouldCreateCycle('A', 'B', [])).toBe(false);
  });

  it('prevents self-loop detection via path', () => {
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
    ];
    // Adding D→B would create B→C→D→B cycle
    expect(wouldCreateCycle('D', 'B', edges)).toBe(true);
    // Adding D→A would create A→B→C→D→A cycle
    expect(wouldCreateCycle('D', 'A', edges)).toBe(true);
    // Adding D→E is fine
    expect(wouldCreateCycle('D', 'E', edges)).toBe(false);
  });
});
