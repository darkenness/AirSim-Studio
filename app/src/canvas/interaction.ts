/**
 * interaction.ts — Canvas event handling logic.
 * Orthogonal wall drawing, vertex snapping, hit-testing, rectangle tool.
 */

import type { Camera2D } from './camera2d';
import { snapToGrid } from './camera2d';
import type { Geometry, GeoVertex, GeoEdge } from '../model/geometry';
import { getFaceVertices } from '../model/geometry';

// ── Lookup maps for O(1) vertex/edge access in hot paths ──
// L-10: Cache maps per geometry arrays (reference equality) to avoid O(n) rebuilds per frame

let _cachedVertices: readonly GeoVertex[] | null = null;
let _cachedVertexMap: Map<string, GeoVertex> | null = null;

let _cachedEdges: readonly GeoEdge[] | null = null;
let _cachedEdgeMap: Map<string, GeoEdge> | null = null;

function buildVertexMap(geo: Geometry): Map<string, GeoVertex> {
  if (geo.vertices === _cachedVertices && _cachedVertexMap) return _cachedVertexMap;
  _cachedVertices = geo.vertices;
  _cachedVertexMap = new Map(geo.vertices.map(v => [v.id, v]));
  return _cachedVertexMap;
}

function buildEdgeMap(geo: Geometry): Map<string, GeoEdge> {
  if (geo.edges === _cachedEdges && _cachedEdgeMap) return _cachedEdgeMap;
  _cachedEdges = geo.edges;
  _cachedEdgeMap = new Map(geo.edges.map(e => [e.id, e]));
  return _cachedEdgeMap;
}

// ── Orthogonal constraint ──

export interface OrthoResult {
  x: number;
  y: number;
  snappedVertexId: string | null;
}

/**
 * Constrain endpoint to orthogonal (horizontal or vertical) from start.
 * M-08: Vertex snapping ALWAYS takes priority over orthogonal constraint,
 * enabling room closure even when the snap target isn't perfectly orthogonal.
 */
export function constrainOrthogonal(
  startX: number, startY: number,
  mouseWX: number, mouseWY: number,
  gridSize: number,
  geo: Geometry,
  snapThreshold: number, // world units
): OrthoResult {
  // 1. Orthogonal constraint: pick axis with larger delta
  const dx = Math.abs(mouseWX - startX);
  const dy = Math.abs(mouseWY - startY);

  const isHorizontal = dx >= dy;
  const orthoX = isHorizontal ? mouseWX : startX;
  const orthoY = isHorizontal ? startY : mouseWY;

  // 2. Vertex snapping — only if the snapped vertex is on the same orthogonal axis
  const snapCandidate = findNearestVertex(geo, orthoX, orthoY, snapThreshold);
  if (snapCandidate) {
    // Check if snap target aligns with orthogonal constraint
    const snapDx = Math.abs(snapCandidate.x - startX);
    const snapDy = Math.abs(snapCandidate.y - startY);
    if (isHorizontal && snapDy < 0.05) {
      // Horizontal wall: snap target shares Y axis
      return { x: snapCandidate.x, y: startY, snappedVertexId: snapCandidate.id };
    } else if (!isHorizontal && snapDx < 0.05) {
      // Vertical wall: snap target shares X axis
      return { x: startX, y: snapCandidate.y, snappedVertexId: snapCandidate.id };
    }
    // Also allow snapping to the start vertex's exact position (for closing loops)
    const distToStart = Math.sqrt((snapCandidate.x - startX) ** 2 + (snapCandidate.y - startY) ** 2);
    if (distToStart < 0.05) {
      return { x: snapCandidate.x, y: snapCandidate.y, snappedVertexId: snapCandidate.id };
    }
    // Check if snap target is at a corner (shares either X or Y with start)
    if (snapDx < 0.05 || snapDy < 0.05) {
      return { x: snapCandidate.x, y: snapCandidate.y, snappedVertexId: snapCandidate.id };
    }
  }

  // 3. Grid snap on the constrained axis
  if (isHorizontal) {
    return { x: snapToGrid(mouseWX, gridSize), y: startY, snappedVertexId: null };
  } else {
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
  const vertexMap = buildVertexMap(geo);

  for (const edge of geo.edges) {
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
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
  // M-10: Hit tolerance matches rendered icon size (Math.max(6, zoom * 0.18) px)
  const iconScreenPx = Math.max(6, camera.zoom * 0.18);
  const toleranceWorld = Math.max(10, iconScreenPx) / camera.zoom;
  const vertexMap = buildVertexMap(geo);
  const edgeMap = buildEdgeMap(geo);

  for (const pl of placements) {
    const edge = edgeMap.get(pl.edgeId);
    if (!edge) continue;
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
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
  const edgeMap = buildEdgeMap(geo);
  const vertexMap = buildVertexMap(geo);
  const edge = edgeMap.get(edgeId);
  if (!edge) return 0.5;
  const v1 = vertexMap.get(edge.vertexIds[0]);
  const v2 = vertexMap.get(edge.vertexIds[1]);
  if (!v1 || !v2) return 0.5;

  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0.5;

  const t = ((wx - v1.x) * dx + (wy - v1.y) * dy) / len2;
  return Math.max(0.05, Math.min(0.95, t));
}

// ── Box hit-testing (for drag-select erase) ──

/**
 * Return IDs of all edges that intersect or are fully inside the given
 * world-coordinate rectangle (x1,y1)–(x2,y2).
 */
export function boxHitTestEdges(
  geo: Geometry,
  x1: number, y1: number,
  x2: number, y2: number,
): string[] {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const vertexMap = buildVertexMap(geo);
  const result: string[] = [];

  for (const edge of geo.edges) {
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    // If either endpoint is inside the box, the edge intersects
    if (pointInBox(v1.x, v1.y, minX, minY, maxX, maxY) ||
        pointInBox(v2.x, v2.y, minX, minY, maxX, maxY)) {
      result.push(edge.id);
      continue;
    }

    // Check if the segment crosses any of the 4 box edges
    if (segmentIntersectsBox(v1.x, v1.y, v2.x, v2.y, minX, minY, maxX, maxY)) {
      result.push(edge.id);
    }
  }
  return result;
}

/**
 * Return IDs of all placements whose position falls inside the given
 * world-coordinate rectangle.
 */
export function boxHitTestPlacements(
  geo: Geometry,
  placements: import('../model/geometry').EdgePlacement[],
  x1: number, y1: number,
  x2: number, y2: number,
): string[] {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const vertexMap = buildVertexMap(geo);
  const edgeMap = buildEdgeMap(geo);
  const result: string[] = [];

  for (const pl of placements) {
    const edge = edgeMap.get(pl.edgeId);
    if (!edge) continue;
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const px = v1.x + (v2.x - v1.x) * pl.alpha;
    const py = v1.y + (v2.y - v1.y) * pl.alpha;
    if (pointInBox(px, py, minX, minY, maxX, maxY)) {
      result.push(pl.id);
    }
  }
  return result;
}

function pointInBox(px: number, py: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

/** Check if segment (ax,ay)-(bx,by) intersects the axis-aligned box */
function segmentIntersectsBox(
  ax: number, ay: number, bx: number, by: number,
  minX: number, minY: number, maxX: number, maxY: number,
): boolean {
  // Cohen-Sutherland style: test segment against each box edge
  return (
    segmentsIntersect(ax, ay, bx, by, minX, minY, maxX, minY) ||
    segmentsIntersect(ax, ay, bx, by, maxX, minY, maxX, maxY) ||
    segmentsIntersect(ax, ay, bx, by, maxX, maxY, minX, maxY) ||
    segmentsIntersect(ax, ay, bx, by, minX, maxY, minX, minY)
  );
}

/** Check if two line segments intersect */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // Collinear cases
  if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;
  if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  return false;
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) &&
         Math.min(ay, by) <= py && py <= Math.max(ay, by);
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
