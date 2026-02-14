/**
 * interaction.ts — Canvas event handling logic.
 * Orthogonal wall drawing, vertex snapping, hit-testing, rectangle tool.
 */

import type { Camera2D } from './camera2d';
import { snapToGrid } from './camera2d';
import type { Geometry, GeoVertex } from '../model/geometry';

// ── Orthogonal constraint ──

export interface OrthoResult {
  x: number;
  y: number;
  snappedVertexId: string | null;
}

/**
 * Constrain endpoint to orthogonal (horizontal or vertical) from start.
 * Vertex snapping takes priority if the snap target is also orthogonal.
 */
export function constrainOrthogonal(
  startX: number, startY: number,
  mouseWX: number, mouseWY: number,
  gridSize: number,
  geo: Geometry,
  snapThreshold: number, // world units
): OrthoResult {
  // 1. Check vertex snapping first
  const snapCandidate = findNearestVertex(geo, mouseWX, mouseWY, snapThreshold);
  if (snapCandidate) {
    // Only snap if it produces an orthogonal wall
    if (Math.abs(snapCandidate.x - startX) < 1e-6 || Math.abs(snapCandidate.y - startY) < 1e-6) {
      return { x: snapCandidate.x, y: snapCandidate.y, snappedVertexId: snapCandidate.id };
    }
  }

  // 2. Orthogonal constraint: pick axis with larger delta
  const dx = Math.abs(mouseWX - startX);
  const dy = Math.abs(mouseWY - startY);

  if (dx >= dy) {
    // Horizontal wall: lock Y
    return { x: snapToGrid(mouseWX, gridSize), y: startY, snappedVertexId: null };
  } else {
    // Vertical wall: lock X
    return { x: startX, y: snapToGrid(mouseWY, gridSize), snappedVertexId: null };
  }
}

// ── Vertex snapping ──

export function findNearestVertex(
  geo: Geometry,
  wx: number, wy: number,
  threshold: number,
): GeoVertex | null {
  let best: GeoVertex | null = null;
  let bestDist = threshold;

  for (const v of geo.vertices) {
    const d = Math.sqrt((v.x - wx) ** 2 + (v.y - wy) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

// ── Hit-testing ──

const EDGE_HIT_TOLERANCE_PX = 8; // screen pixels

export function hitTestEdge(
  geo: Geometry,
  wx: number, wy: number,
  camera: Camera2D,
): string | null {
  const toleranceWorld = EDGE_HIT_TOLERANCE_PX / camera.zoom;

  for (const edge of geo.edges) {
    const v1 = geo.vertices.find(v => v.id === edge.vertexIds[0]);
    const v2 = geo.vertices.find(v => v.id === edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const dist = pointToSegmentDist(wx, wy, v1.x, v1.y, v2.x, v2.y);
    if (dist < toleranceWorld) {
      return edge.id;
    }
  }
  return null;
}

export function hitTestFace(
  geo: Geometry,
  wx: number, wy: number,
): string | null {
  for (const face of geo.faces) {
    const verts = getFaceVertices(geo, face);
    if (verts.length < 3) continue;
    if (pointInPolygon(wx, wy, verts)) {
      return face.id;
    }
  }
  return null;
}

export interface PlacementHit {
  placementId: string;
}

export function hitTestPlacement(
  geo: Geometry,
  placements: import('../model/geometry').EdgePlacement[],
  wx: number, wy: number,
  camera: Camera2D,
): string | null {
  const toleranceWorld = 10 / camera.zoom; // 10px tolerance

  for (const pl of placements) {
    const edge = geo.edges.find(e => e.id === pl.edgeId);
    if (!edge) continue;
    const v1 = geo.vertices.find(v => v.id === edge.vertexIds[0]);
    const v2 = geo.vertices.find(v => v.id === edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const px = v1.x + (v2.x - v1.x) * pl.alpha;
    const py = v1.y + (v2.y - v1.y) * pl.alpha;
    const dist = Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);
    if (dist < toleranceWorld) {
      return pl.id;
    }
  }
  return null;
}

/**
 * Combined hit-test: returns best match (placement > edge > face)
 */
export function hitTest(
  geo: Geometry,
  placements: import('../model/geometry').EdgePlacement[],
  wx: number, wy: number,
  camera: Camera2D,
): { type: 'placement' | 'edge' | 'face' | 'none'; id: string | null } {
  const plId = hitTestPlacement(geo, placements, wx, wy, camera);
  if (plId) return { type: 'placement', id: plId };

  const edgeId = hitTestEdge(geo, wx, wy, camera);
  if (edgeId) return { type: 'edge', id: edgeId };

  const faceId = hitTestFace(geo, wx, wy);
  if (faceId) return { type: 'face', id: faceId };

  return { type: 'none', id: null };
}

// ── Placement alpha from click on edge ──

export function computeAlphaOnEdge(
  geo: Geometry,
  edgeId: string,
  wx: number, wy: number,
): number {
  const edge = geo.edges.find(e => e.id === edgeId);
  if (!edge) return 0.5;
  const v1 = geo.vertices.find(v => v.id === edge.vertexIds[0]);
  const v2 = geo.vertices.find(v => v.id === edge.vertexIds[1]);
  if (!v1 || !v2) return 0.5;

  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0.5;

  const t = ((wx - v1.x) * dx + (wy - v1.y) * dy) / len2;
  return Math.max(0.05, Math.min(0.95, t));
}

// ── Geometry helpers ──

function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);

  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function getFaceVertices(geo: Geometry, face: import('../model/geometry').GeoFace): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < face.edgeIds.length; i++) {
    const edge = geo.edges.find(e => e.id === face.edgeIds[i]);
    if (!edge) continue;
    const vIdx = face.edgeOrder[i] === 0 ? 0 : 1;
    const v = geo.vertices.find(v => v.id === edge.vertexIds[vIdx]);
    if (v) pts.push({ x: v.x, y: v.y });
  }
  return pts;
}

function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
