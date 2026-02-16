import { describe, it, expect } from 'vitest';
import {
  constrainOrthogonal,
  findNearestVertex,
  hitTestEdge,
  hitTestFace,
  hitTestPlacement,
  hitTest,
  computeAlphaOnEdge,
} from '../canvas/interaction';
import type { Camera2D } from '../canvas/camera2d';
import {
  createEmptyGeometry,
  addWall,
  rebuildFaces,
} from '../model/geometry';
import type { Geometry, EdgePlacement } from '../model/geometry';

// Helper: build a rectangular room and return the geometry
function buildRect(x: number, y: number, w: number, h: number): Geometry {
  const geo = createEmptyGeometry();
  addWall(geo, x, y, x + w, y);
  addWall(geo, x + w, y, x + w, y + h);
  addWall(geo, x + w, y + h, x, y + h);
  addWall(geo, x, y + h, x, y);
  rebuildFaces(geo);
  return geo;
}

const defaultCamera: Camera2D = { panX: 0, panY: 0, zoom: 50 };

describe('interaction.ts', () => {
  // ── constrainOrthogonal ──
  describe('constrainOrthogonal', () => {
    it('constrains to horizontal when dx > dy', () => {
      const geo = createEmptyGeometry();
      const result = constrainOrthogonal(0, 0, 5, 1, 0.1, geo, 0.3);
      expect(result.y).toBe(0); // locked Y to startY
      expect(result.snappedVertexId).toBeNull();
    });

    it('constrains to vertical when dy > dx', () => {
      const geo = createEmptyGeometry();
      const result = constrainOrthogonal(0, 0, 1, 5, 0.1, geo, 0.3);
      expect(result.x).toBe(0); // locked X to startX
      expect(result.snappedVertexId).toBeNull();
    });

    it('snaps to grid on the free axis', () => {
      const geo = createEmptyGeometry();
      const result = constrainOrthogonal(0, 0, 3.14, 0.5, 0.1, geo, 0.3);
      // dx=3.14 > dy=0.5 => horizontal, Y locked, X snapped to grid
      expect(result.y).toBe(0);
      expect(result.x).toBeCloseTo(3.1, 1); // snapped to 0.1 grid
    });

    it('snaps to existing vertex if orthogonal', () => {
      const geo = createEmptyGeometry();
      // Create a vertex at (5, 0) — same Y as start
      addWall(geo, 5, 0, 5, 3);
      const result = constrainOrthogonal(0, 0, 4.8, 0.1, 0.1, geo, 0.5);
      // Vertex at (5,0) is within threshold and orthogonal (same Y=0)
      expect(result.x).toBe(5);
      expect(result.y).toBe(0);
      expect(result.snappedVertexId).not.toBeNull();
    });

    it('snaps to nearby vertex even if not orthogonal (M-08: vertex wins)', () => {
      const geo = createEmptyGeometry();
      // Create a vertex at (5, 3) — different X and Y from start
      addWall(geo, 5, 3, 8, 3);
      const result = constrainOrthogonal(0, 0, 4.9, 2.8, 0.1, geo, 0.5);
      // M-08: vertex snapping always wins over orthogonal constraint
      expect(result.x).toBe(5);
      expect(result.y).toBe(3);
      expect(result.snappedVertexId).not.toBeNull();
    });
  });

  // ── findNearestVertex ──
  describe('findNearestVertex', () => {
    it('finds vertex within threshold', () => {
      const geo = createEmptyGeometry();
      addWall(geo, 3, 4, 7, 4);
      const v = findNearestVertex(geo, 3.05, 4.05, 0.2);
      expect(v).not.toBeNull();
      expect(v!.x).toBe(3);
      expect(v!.y).toBe(4);
    });

    it('returns null when no vertex within threshold', () => {
      const geo = createEmptyGeometry();
      addWall(geo, 3, 4, 7, 4);
      const v = findNearestVertex(geo, 100, 100, 0.2);
      expect(v).toBeNull();
    });

    it('returns closest vertex when multiple are near', () => {
      const geo = createEmptyGeometry();
      addWall(geo, 0, 0, 1, 0);
      // Vertices at (0,0) and (1,0)
      const v = findNearestVertex(geo, 0.1, 0, 0.5);
      expect(v).not.toBeNull();
      expect(v!.x).toBe(0);
    });

    it('returns null for empty geometry', () => {
      const geo = createEmptyGeometry();
      expect(findNearestVertex(geo, 0, 0, 1.0)).toBeNull();
    });
  });

  // ── hitTestEdge ──
  describe('hitTestEdge', () => {
    it('hits edge when point is close enough', () => {
      const geo = buildRect(0, 0, 5, 4);
      // Point very close to the top edge (y=0, x in [0,5])
      const edgeId = hitTestEdge(geo, 2.5, 0.01, defaultCamera);
      expect(edgeId).not.toBeNull();
    });

    it('misses edge when point is far away', () => {
      const geo = buildRect(0, 0, 5, 4);
      const edgeId = hitTestEdge(geo, 50, 50, defaultCamera);
      expect(edgeId).toBeNull();
    });

    it('tolerance scales with zoom (higher zoom = tighter tolerance)', () => {
      const geo = buildRect(0, 0, 5, 4);
      const highZoom: Camera2D = { panX: 0, panY: 0, zoom: 200 };
      // 8px / 200 = 0.04m tolerance
      // Point at 0.05m from edge should miss at high zoom
      const edgeId = hitTestEdge(geo, 2.5, 0.05, highZoom);
      expect(edgeId).toBeNull();
    });
  });

  // ── hitTestFace ──
  describe('hitTestFace', () => {
    it('hits face when point is inside polygon', () => {
      const geo = buildRect(0, 0, 5, 4);
      const faceId = hitTestFace(geo, 2.5, 2.0);
      expect(faceId).not.toBeNull();
    });

    it('misses face when point is outside polygon', () => {
      const geo = buildRect(0, 0, 5, 4);
      const faceId = hitTestFace(geo, 10, 10);
      expect(faceId).toBeNull();
    });

    it('returns null for empty geometry', () => {
      const geo = createEmptyGeometry();
      expect(hitTestFace(geo, 0, 0)).toBeNull();
    });
  });

  // ── hitTestPlacement ──
  describe('hitTestPlacement', () => {
    it('hits placement near its position on edge', () => {
      const geo = buildRect(0, 0, 5, 4);
      const edge = geo.edges[0]; // top edge
      const placements: EdgePlacement[] = [{
        id: 'p1',
        edgeId: edge.id,
        alpha: 0.5,
        type: 'door',
        isConfigured: false,
      }];
      // Placement is at midpoint of top edge: (2.5, 0)
      const hit = hitTestPlacement(geo, placements, 2.5, 0.05, defaultCamera);
      expect(hit).toBe('p1');
    });

    it('misses placement when far away', () => {
      const geo = buildRect(0, 0, 5, 4);
      const edge = geo.edges[0];
      const placements: EdgePlacement[] = [{
        id: 'p1',
        edgeId: edge.id,
        alpha: 0.5,
        type: 'door',
        isConfigured: false,
      }];
      const hit = hitTestPlacement(geo, placements, 50, 50, defaultCamera);
      expect(hit).toBeNull();
    });

    it('returns null for empty placements', () => {
      const geo = buildRect(0, 0, 5, 4);
      expect(hitTestPlacement(geo, [], 2.5, 2.0, defaultCamera)).toBeNull();
    });
  });

  // ── hitTest priority: placement > edge > face ──
  describe('hitTest (combined)', () => {
    it('returns placement when all overlap', () => {
      const geo = buildRect(0, 0, 5, 4);
      const edge = geo.edges[0];
      const placements: EdgePlacement[] = [{
        id: 'p1',
        edgeId: edge.id,
        alpha: 0.5,
        type: 'door',
        isConfigured: false,
      }];
      // Point right at the placement position on the edge
      const result = hitTest(geo, placements, 2.5, 0.0, defaultCamera);
      expect(result.type).toBe('placement');
      expect(result.id).toBe('p1');
    });

    it('returns edge when no placement but on edge', () => {
      const geo = buildRect(0, 0, 5, 4);
      const result = hitTest(geo, [], 2.5, 0.0, defaultCamera);
      expect(result.type).toBe('edge');
      expect(result.id).not.toBeNull();
    });

    it('returns face when inside polygon but not on edge', () => {
      const geo = buildRect(0, 0, 5, 4);
      const result = hitTest(geo, [], 2.5, 2.0, defaultCamera);
      expect(result.type).toBe('face');
      expect(result.id).not.toBeNull();
    });

    it('returns none when outside everything', () => {
      const geo = buildRect(0, 0, 5, 4);
      const result = hitTest(geo, [], 100, 100, defaultCamera);
      expect(result.type).toBe('none');
      expect(result.id).toBeNull();
    });
  });

  // ── computeAlphaOnEdge ──
  describe('computeAlphaOnEdge', () => {
    it('returns ~0.5 for midpoint of horizontal edge', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 10, 0);
      const alpha = computeAlphaOnEdge(geo, edge.id, 5, 0);
      expect(alpha).toBeCloseTo(0.5, 2);
    });

    it('clamps to [0.05, 0.95]', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 10, 0);
      // Point beyond the edge start
      const alphaStart = computeAlphaOnEdge(geo, edge.id, -5, 0);
      expect(alphaStart).toBe(0.05);
      // Point beyond the edge end
      const alphaEnd = computeAlphaOnEdge(geo, edge.id, 15, 0);
      expect(alphaEnd).toBe(0.95);
    });

    it('returns 0.5 for non-existent edge', () => {
      const geo = createEmptyGeometry();
      expect(computeAlphaOnEdge(geo, 'nonexistent', 0, 0)).toBe(0.5);
    });

    it('handles vertical edge', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 0, 10);
      const alpha = computeAlphaOnEdge(geo, edge.id, 0, 7.5);
      expect(alpha).toBeCloseTo(0.75, 2);
    });

    it('projects perpendicular point onto edge', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 10, 0);
      // Point at (5, 3) — perpendicular projection lands at (5, 0) => alpha=0.5
      const alpha = computeAlphaOnEdge(geo, edge.id, 5, 3);
      expect(alpha).toBeCloseTo(0.5, 2);
    });
  });
});
