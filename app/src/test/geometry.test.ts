import { describe, it, expect } from 'vitest';
import {
  createEmptyGeometry,
  createDefaultStory,
  stableFaceId,
  faceArea,
  rebuildFaces,
  addWall,
  removeEdge,
  findOrCreateVertex,
  findEdgeBetween,
  edgeLength,
  getVertex,
  getEdgeEndpoints,
  getPositionOnEdge,
  getFaceVertices,
  faceCentroid,
} from '../model/geometry';
import type { Geometry } from '../model/geometry';

// ── Helper: build a rectangular room (4 walls) ──
function buildRectRoom(geo: Geometry, x: number, y: number, w: number, h: number, wallHeight = 3.0) {
  addWall(geo, x, y, x + w, y, wallHeight);       // top
  addWall(geo, x + w, y, x + w, y + h, wallHeight); // right
  addWall(geo, x + w, y + h, x, y + h, wallHeight); // bottom
  addWall(geo, x, y + h, x, y, wallHeight);         // left
  rebuildFaces(geo);
}

describe('geometry.ts', () => {
  // ── createEmptyGeometry ──
  describe('createEmptyGeometry', () => {
    it('returns geometry with empty arrays', () => {
      const geo = createEmptyGeometry();
      expect(geo.vertices).toEqual([]);
      expect(geo.edges).toEqual([]);
      expect(geo.faces).toEqual([]);
    });
  });

  // ── createDefaultStory ──
  describe('createDefaultStory', () => {
    it('creates ground floor story with correct defaults', () => {
      const story = createDefaultStory(0);
      expect(story.level).toBe(0);
      expect(story.name).toBe('首层');
      expect(story.floorToCeilingHeight).toBe(3.0);
      expect(story.geometry.vertices).toEqual([]);
      expect(story.placements).toEqual([]);
      expect(story.zoneAssignments).toEqual([]);
      expect(story.id).toMatch(/^story_/);
    });

    it('creates upper floor with correct name', () => {
      const story = createDefaultStory(2);
      expect(story.level).toBe(2);
      expect(story.name).toBe('第 3 层');
    });
  });

  // ── stableFaceId ──
  describe('stableFaceId', () => {
    it('generates deterministic ID from edge IDs', () => {
      const id1 = stableFaceId(['e_a', 'e_b', 'e_c']);
      const id2 = stableFaceId(['e_a', 'e_b', 'e_c']);
      expect(id1).toBe(id2);
    });

    it('is order-independent (sorted)', () => {
      const id1 = stableFaceId(['e_c', 'e_a', 'e_b']);
      const id2 = stableFaceId(['e_a', 'e_b', 'e_c']);
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different edge sets', () => {
      const id1 = stableFaceId(['e_a', 'e_b']);
      const id2 = stableFaceId(['e_a', 'e_c']);
      expect(id1).not.toBe(id2);
    });

    it('has f_ prefix', () => {
      expect(stableFaceId(['e_x'])).toMatch(/^f_/);
    });
  });

  // ── findOrCreateVertex ──
  describe('findOrCreateVertex', () => {
    it('creates a new vertex when none nearby', () => {
      const geo = createEmptyGeometry();
      const { vertex, isNew } = findOrCreateVertex(geo, 1.0, 2.0);
      expect(isNew).toBe(true);
      expect(vertex.x).toBe(1.0);
      expect(vertex.y).toBe(2.0);
      expect(geo.vertices).toHaveLength(1);
    });

    it('snaps to existing vertex within threshold', () => {
      const geo = createEmptyGeometry();
      findOrCreateVertex(geo, 1.0, 2.0);
      const { vertex, isNew } = findOrCreateVertex(geo, 1.05, 2.03, 0.08);
      expect(isNew).toBe(false);
      expect(vertex.x).toBe(1.0);
      expect(vertex.y).toBe(2.0);
      expect(geo.vertices).toHaveLength(1);
    });

    it('creates new vertex when outside threshold', () => {
      const geo = createEmptyGeometry();
      findOrCreateVertex(geo, 1.0, 2.0);
      const { isNew } = findOrCreateVertex(geo, 2.0, 3.0, 0.08);
      expect(isNew).toBe(true);
      expect(geo.vertices).toHaveLength(2);
    });
  });

  // ── addWall ──
  describe('addWall', () => {
    it('creates vertices and edge', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 5, 0);
      expect(geo.vertices).toHaveLength(2);
      expect(geo.edges).toHaveLength(1);
      expect(edge.wallHeight).toBe(3.0);
      expect(edge.isExterior).toBe(true);
    });

    it('reuses existing vertices when snapping', () => {
      const geo = createEmptyGeometry();
      addWall(geo, 0, 0, 5, 0);
      addWall(geo, 5, 0, 5, 4); // shares vertex at (5,0)
      expect(geo.vertices).toHaveLength(3); // not 4
      expect(geo.edges).toHaveLength(2);
    });

    it('returns existing edge if duplicate', () => {
      const geo = createEmptyGeometry();
      const e1 = addWall(geo, 0, 0, 5, 0);
      const e2 = addWall(geo, 0, 0, 5, 0);
      expect(e1.id).toBe(e2.id);
      expect(geo.edges).toHaveLength(1);
    });
  });

  // ── findEdgeBetween ──
  describe('findEdgeBetween', () => {
    it('finds edge regardless of vertex order', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 5, 0);
      const [v1Id, v2Id] = edge.vertexIds;
      expect(findEdgeBetween(geo, v1Id, v2Id)).toBeDefined();
      expect(findEdgeBetween(geo, v2Id, v1Id)).toBeDefined();
    });

    it('returns undefined for non-existent edge', () => {
      const geo = createEmptyGeometry();
      expect(findEdgeBetween(geo, 'x', 'y')).toBeUndefined();
    });
  });

  // ── edgeLength ──
  describe('edgeLength', () => {
    it('calculates horizontal edge length', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 5, 0);
      expect(edgeLength(geo, edge)).toBeCloseTo(5.0);
    });

    it('calculates diagonal edge length', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 3, 4);
      expect(edgeLength(geo, edge)).toBeCloseTo(5.0);
    });
  });

  // ── getEdgeEndpoints / getPositionOnEdge ──
  describe('getEdgeEndpoints', () => {
    it('returns [x1, y1, x2, y2]', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 1, 2, 3, 4);
      const pts = getEdgeEndpoints(geo, edge);
      expect(pts).toEqual([1, 2, 3, 4]);
    });
  });

  describe('getPositionOnEdge', () => {
    it('returns midpoint at alpha=0.5', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 10, 0);
      const pos = getPositionOnEdge(geo, edge, 0.5);
      expect(pos).toEqual({ x: 5, y: 0 });
    });

    it('returns start at alpha=0', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 2, 3, 8, 3);
      const pos = getPositionOnEdge(geo, edge, 0);
      expect(pos).toEqual({ x: 2, y: 3 });
    });

    it('returns end at alpha=1', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 2, 3, 8, 3);
      const pos = getPositionOnEdge(geo, edge, 1);
      expect(pos).toEqual({ x: 8, y: 3 });
    });
  });

  // ── rebuildFaces ──
  describe('rebuildFaces', () => {
    it('detects a single rectangular face from 4 walls', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 5, 4);
      expect(geo.faces).toHaveLength(1);
      expect(geo.faces[0].edgeIds).toHaveLength(4);
    });

    it('detects two faces from adjacent rooms sharing a wall', () => {
      const geo = createEmptyGeometry();
      // Room 1: (0,0)-(5,4)
      addWall(geo, 0, 0, 5, 0);
      addWall(geo, 5, 0, 5, 4);
      addWall(geo, 5, 4, 0, 4);
      addWall(geo, 0, 4, 0, 0);
      // Room 2: (5,0)-(10,4) shares wall at x=5
      addWall(geo, 5, 0, 10, 0);
      addWall(geo, 10, 0, 10, 4);
      addWall(geo, 10, 4, 5, 4);
      // shared wall (5,0)-(5,4) already exists
      rebuildFaces(geo);
      expect(geo.faces).toHaveLength(2);
    });

    it('updates edge faceIds after rebuild', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 5, 4);
      // Each edge of a single room should have exactly 1 face
      for (const edge of geo.edges) {
        expect(edge.faceIds.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('marks shared wall as non-exterior', () => {
      const geo = createEmptyGeometry();
      // Two adjacent rooms
      addWall(geo, 0, 0, 5, 0);
      addWall(geo, 5, 0, 5, 4);
      addWall(geo, 5, 4, 0, 4);
      addWall(geo, 0, 4, 0, 0);
      addWall(geo, 5, 0, 10, 0);
      addWall(geo, 10, 0, 10, 4);
      addWall(geo, 10, 4, 5, 4);
      rebuildFaces(geo);

      // The shared wall at x=5 should have 2 faceIds and isExterior=false
      const sharedEdge = geo.edges.find(e => {
        const v1 = getVertex(geo, e.vertexIds[0]);
        const v2 = getVertex(geo, e.vertexIds[1]);
        if (!v1 || !v2) return false;
        return (v1.x === 5 && v2.x === 5) || (v2.x === 5 && v1.x === 5);
      });
      expect(sharedEdge).toBeDefined();
      expect(sharedEdge!.faceIds).toHaveLength(2);
      expect(sharedEdge!.isExterior).toBe(false);
    });

    it('produces stable face IDs across rebuilds', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 5, 4);
      const faceId1 = geo.faces[0].id;
      rebuildFaces(geo);
      const faceId2 = geo.faces[0].id;
      expect(faceId1).toBe(faceId2);
    });

    it('handles no edges gracefully', () => {
      const geo = createEmptyGeometry();
      rebuildFaces(geo);
      expect(geo.faces).toEqual([]);
    });
  });

  // ── faceArea ──
  describe('faceArea', () => {
    it('calculates area of a 5x4 rectangle', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 5, 4);
      expect(geo.faces).toHaveLength(1);
      const area = faceArea(geo, geo.faces[0]);
      expect(area).toBeCloseTo(20.0, 1);
    });

    it('calculates area of a 1x1 unit square', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 1, 1);
      expect(geo.faces).toHaveLength(1);
      const area = faceArea(geo, geo.faces[0]);
      expect(area).toBeCloseTo(1.0, 1);
    });

    it('returns 0 for degenerate face with < 3 vertices', () => {
      const geo = createEmptyGeometry();
      // Manually create a face with only 2 edges (not a real polygon)
      const area = faceArea(geo, { id: 'fake', edgeIds: [], edgeOrder: [] });
      expect(area).toBe(0);
    });

    it('calculates area of non-origin rectangle', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 10, 20, 3, 7);
      expect(geo.faces).toHaveLength(1);
      const area = faceArea(geo, geo.faces[0]);
      expect(area).toBeCloseTo(21.0, 1);
    });
  });

  // ── getFaceVertices / faceCentroid ──
  describe('getFaceVertices', () => {
    it('returns ordered vertices for a rectangular face', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 4, 3);
      const verts = getFaceVertices(geo, geo.faces[0]);
      expect(verts.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('faceCentroid', () => {
    it('returns center of a symmetric rectangle', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 4, 6);
      const c = faceCentroid(geo, geo.faces[0]);
      expect(c.x).toBeCloseTo(2.0, 1);
      expect(c.y).toBeCloseTo(3.0, 1);
    });

    it('returns (0,0) for empty face', () => {
      const geo = createEmptyGeometry();
      const c = faceCentroid(geo, { id: 'fake', edgeIds: [], edgeOrder: [] });
      expect(c).toEqual({ x: 0, y: 0 });
    });
  });

  // ── removeEdge ──
  describe('removeEdge', () => {
    it('removes edge and cleans up orphan vertices', () => {
      const geo = createEmptyGeometry();
      const edge = addWall(geo, 0, 0, 5, 0);
      expect(geo.edges).toHaveLength(1);
      expect(geo.vertices).toHaveLength(2);

      removeEdge(geo, edge.id);
      expect(geo.edges).toHaveLength(0);
      expect(geo.vertices).toHaveLength(0); // orphans removed
    });

    it('keeps shared vertices when other edges remain', () => {
      const geo = createEmptyGeometry();
      addWall(geo, 0, 0, 5, 0);
      const e2 = addWall(geo, 5, 0, 5, 4);
      expect(geo.vertices).toHaveLength(3);

      removeEdge(geo, e2.id);
      expect(geo.edges).toHaveLength(1);
      expect(geo.vertices).toHaveLength(2); // shared vertex at (5,0) still used
    });

    it('removes faces that reference the deleted edge', () => {
      const geo = createEmptyGeometry();
      buildRectRoom(geo, 0, 0, 5, 4);
      expect(geo.faces).toHaveLength(1);

      const edgeToRemove = geo.edges[0];
      removeEdge(geo, edgeToRemove.id);
      expect(geo.faces).toHaveLength(0);
    });

    it('is a no-op for non-existent edge ID', () => {
      const geo = createEmptyGeometry();
      addWall(geo, 0, 0, 5, 0);
      removeEdge(geo, 'nonexistent');
      expect(geo.edges).toHaveLength(1);
    });
  });
});
