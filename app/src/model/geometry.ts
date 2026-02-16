// ── Vertex → Edge → Face Geometry Model (inspired by Floorspace.js) ──

export interface GeoVertex {
  id: string;
  x: number;  // world X axis (meters) — east/west in plan view
  y: number;  // world Z axis (meters) — north/south in plan view
              // IMPORTANT: In Three.js 3D space, this maps to Z (not Y).
              // The 2D→3D mapping is: GeoVertex(x, y) → THREE.Vector3(x, 0, y)
              // ZoneFloor uses rotation [-π/2, 0, 0] to convert Shape(x,y) → mesh(x, 0, y)
  edgeIds: string[];
}

export interface GeoEdge {
  id: string;
  vertexIds: [string, string];
  faceIds: string[];       // 0 = boundary, 1 = one face, 2 = shared wall
  wallHeight: number;      // meters (default = story height)
  wallThickness: number;   // meters
  isExterior: boolean;     // true if faceIds.length <= 1
}

export interface GeoFace {
  id: string;
  edgeIds: string[];
  edgeOrder: (0 | 1)[];   // 0 = edge forward, 1 = edge reversed
}

export interface Geometry {
  vertices: GeoVertex[];
  edges: GeoEdge[];
  faces: GeoFace[];
}

// ── Placement on Edge (doors, windows, flow paths) ──

export interface EdgePlacement {
  id: string;
  edgeId: string;
  alpha: number;           // 0..1 position along edge
  type: 'door' | 'window' | 'opening' | 'fan' | 'duct' | 'damper' | 'filter' | 'crack' | 'srv' | 'checkValve';
  definitionId?: string;   // reference to flow element definition
  isConfigured: boolean;   // red/black validation state

  // Common parameters (CONTAM-style)
  relativeElevation?: number;  // m, relative to floor level
  multiplier?: number;         // number of identical openings

  // PowerLaw parameters (door, window, crack)
  flowCoefficient?: number;    // C (kg/s/Pa^n)
  flowExponent?: number;       // n (0.5~1.0)

  // Large opening (opening / TwoWayFlow)
  dischargeCd?: number;        // discharge coefficient
  openingArea?: number;        // m²
  openingHeight?: number;      // m (TwoWayFlow opening height)

  // Fan
  maxFlow?: number;            // m³/s
  shutoffPressure?: number;    // Pa

  // Damper
  damperFraction?: number;     // 0~1 open fraction

  // Filter
  filterEfficiency?: number;   // 0~1 removal efficiency

  // Duct
  ductDiameter?: number;       // m
  ductRoughness?: number;      // m
  ductSumK?: number;           // minor loss coefficients

  // Self-regulating vent
  targetFlow?: number;         // m³/s
  pMin?: number;               // Pa
  pMax?: number;               // Pa

  // M-03: Schedule binding
  scheduleId?: string;         // reference to a schedule in useAppStore
}

// ── Story (Floor Level) ──

export interface Story {
  id: string;
  name: string;
  level: number;           // 0 = ground
  floorToCeilingHeight: number;  // meters
  elevation?: number;      // M-05: absolute elevation override (meters)
  geometry: Geometry;
  placements: EdgePlacement[];
  zoneAssignments: ZoneAssignment[];
  backgroundImage?: {
    url: string;
    opacity: number;
    scalePixelsPerMeter: number;
    offsetX: number;
    offsetY: number;
    rotation: 0 | 90 | 180 | 270;
    locked: boolean;
  };
}

// ── Zone Assignment (Face → Zone properties) ──

export interface ZoneAssignment {
  faceId: string;
  zoneId: number;          // maps to engine node ID
  name: string;
  temperature: number;     // K
  volume: number;          // m³ (auto-calculated from face area × height)
  color: string;           // hex color for display
  shaftGroupId?: string;   // C-03: zones with same shaftGroupId auto-connect across floors
  initialConcentrations?: Record<string, number>; // H-07: per-species initial concentrations
}

// ── Helper functions ──

/**
 * Generate a unique ID using crypto.randomUUID (no collision on reload).
 * Falls back to timestamp+random if crypto.randomUUID unavailable.
 */
export function generateId(prefix: string = ''): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Generate a stable face ID from its sorted edge set.
 * Two faces with the same edges always get the same ID.
 * This prevents zone assignment loss when rebuildFaces regenerates faces.
 */
export function stableFaceId(edgeIds: string[]): string {
  return `f_${[...edgeIds].sort().join('+')}`;
}

export function createEmptyGeometry(): Geometry {
  return { vertices: [], edges: [], faces: [] };
}

export function createDefaultStory(level: number = 0): Story {
  return {
    id: generateId('story_'),
    name: level === 0 ? '首层' : `第 ${level + 1} 层`,
    level,
    floorToCeilingHeight: 3.0,
    geometry: createEmptyGeometry(),
    placements: [],
    zoneAssignments: [],
  };
}

/**
 * Get vertex position by ID
 */
export function getVertex(geo: Geometry, id: string): GeoVertex | undefined {
  return geo.vertices.find(v => v.id === id);
}

/**
 * Get edge by ID
 */
export function getEdge(geo: Geometry, id: string): GeoEdge | undefined {
  return geo.edges.find(e => e.id === id);
}

/**
 * Get edge endpoints as [x1, y1, x2, y2]
 */
export function getEdgeEndpoints(geo: Geometry, edge: GeoEdge): [number, number, number, number] | null {
  const v1 = getVertex(geo, edge.vertexIds[0]);
  const v2 = getVertex(geo, edge.vertexIds[1]);
  if (!v1 || !v2) return null;
  return [v1.x, v1.y, v2.x, v2.y];
}

/**
 * Calculate edge length
 */
export function edgeLength(geo: Geometry, edge: GeoEdge): number {
  const pts = getEdgeEndpoints(geo, edge);
  if (!pts) return 0;
  const [x1, y1, x2, y2] = pts;
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Get position along edge at alpha (0..1)
 */
export function getPositionOnEdge(geo: Geometry, edge: GeoEdge, alpha: number): { x: number; y: number } | null {
  const v1 = getVertex(geo, edge.vertexIds[0]);
  const v2 = getVertex(geo, edge.vertexIds[1]);
  if (!v1 || !v2) return null;
  return {
    x: v1.x + alpha * (v2.x - v1.x),
    y: v1.y + alpha * (v2.y - v1.y),
  };
}

/**
 * Find or create a vertex at (x, y), snapping to existing vertex within threshold
 */
// L-31: Grid-based spatial index for fast vertex proximity lookup
function vertexGridKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

function findNearbyVertex(geo: Geometry, x: number, y: number, snapThreshold: number): GeoVertex | null {
  const cellSize = Math.max(snapThreshold * 2, 0.2);
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);

  // Build grid index (cheap for typical vertex counts)
  const grid = new Map<string, GeoVertex[]>();
  for (const v of geo.vertices) {
    const key = vertexGridKey(v.x, v.y, cellSize);
    const bucket = grid.get(key);
    if (bucket) bucket.push(v);
    else grid.set(key, [v]);
  }

  // Check 3x3 neighborhood
  let best: GeoVertex | null = null;
  let bestDist = snapThreshold;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.get(`${cx + dx},${cy + dy}`);
      if (!bucket) continue;
      for (const v of bucket) {
        const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
        if (dist <= bestDist) {
          bestDist = dist;
          best = v;
        }
      }
    }
  }
  return best;
}

export function findOrCreateVertex(geo: Geometry, x: number, y: number, snapThreshold: number = 0.08): { vertex: GeoVertex; isNew: boolean } {
  const found = findNearbyVertex(geo, x, y, snapThreshold);
  if (found) return { vertex: found, isNew: false };

  const vertex: GeoVertex = { id: generateId('v_'), x, y, edgeIds: [] };
  geo.vertices.push(vertex);
  return { vertex, isNew: true };
}

/**
 * Find existing edge between two vertices
 */
export function findEdgeBetween(geo: Geometry, v1Id: string, v2Id: string): GeoEdge | undefined {
  return geo.edges.find(e =>
    (e.vertexIds[0] === v1Id && e.vertexIds[1] === v2Id) ||
    (e.vertexIds[0] === v2Id && e.vertexIds[1] === v1Id)
  );
}

/**
 * Check if a point lies on an edge (within tolerance).
 * Returns the parametric t value (0..1) or null if not on edge.
 */
function pointOnEdge(geo: Geometry, edge: GeoEdge, px: number, py: number, tolerance: number = 0.15): number | null {
  const v1 = getVertex(geo, edge.vertexIds[0]);
  const v2 = getVertex(geo, edge.vertexIds[1]);
  if (!v1 || !v2) return null;

  const ex = v2.x - v1.x;
  const ey = v2.y - v1.y;
  const lenSq = ex * ex + ey * ey;
  if (lenSq < 1e-10) return null;

  // Project point onto edge line
  const t = ((px - v1.x) * ex + (py - v1.y) * ey) / lenSq;
  if (t <= 0.02 || t >= 0.98) return null; // too close to endpoints

  // Distance from point to edge line
  const projX = v1.x + t * ex;
  const projY = v1.y + t * ey;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  if (dist > tolerance) return null;

  return t;
}

/**
 * Split an edge at a given vertex, replacing the original edge with two new edges.
 * The vertex must already exist in the geometry.
 */
function splitEdgeAtVertex(geo: Geometry, edgeId: string, vertexId: string): void {
  const edge = getEdge(geo, edgeId);
  if (!edge) return;
  const splitV = getVertex(geo, vertexId);
  if (!splitV) return;

  const [v1Id, v2Id] = edge.vertexIds;

  // Remove old edge from vertices
  const v1 = getVertex(geo, v1Id);
  const v2 = getVertex(geo, v2Id);
  if (v1) v1.edgeIds = v1.edgeIds.filter(eid => eid !== edgeId);
  if (v2) v2.edgeIds = v2.edgeIds.filter(eid => eid !== edgeId);

  // Remove old edge
  geo.edges = geo.edges.filter(e => e.id !== edgeId);

  // Create two new edges
  const e1: GeoEdge = {
    id: generateId('e_'),
    vertexIds: [v1Id, vertexId],
    faceIds: [],
    wallHeight: edge.wallHeight,
    wallThickness: edge.wallThickness,
    isExterior: true,
  };
  const e2: GeoEdge = {
    id: generateId('e_'),
    vertexIds: [vertexId, v2Id],
    faceIds: [],
    wallHeight: edge.wallHeight,
    wallThickness: edge.wallThickness,
    isExterior: true,
  };

  geo.edges.push(e1, e2);
  if (v1) v1.edgeIds.push(e1.id);
  splitV.edgeIds.push(e1.id, e2.id);
  if (v2) v2.edgeIds.push(e2.id);

  // Migrate placements from old edge to appropriate new edge
  // (handled externally by the store if needed)
}

/**
 * After creating/finding a vertex, check if it lies on any existing edge
 * and split that edge if so. This enables T-junctions for room subdivision.
 */
function trySplitEdgesAtVertex(geo: Geometry, vertex: GeoVertex): void {
  // Collect edges to split (avoid mutating while iterating)
  const toSplit: Array<{ edgeId: string }> = [];
  for (const edge of geo.edges) {
    // Skip edges that already connect to this vertex
    if (edge.vertexIds.includes(vertex.id)) continue;
    const t = pointOnEdge(geo, edge, vertex.x, vertex.y);
    if (t !== null) {
      toSplit.push({ edgeId: edge.id });
    }
  }
  for (const { edgeId } of toSplit) {
    splitEdgeAtVertex(geo, edgeId, vertex.id);
  }
}

/**
 * After creating a new edge, check if any existing vertices (not its own endpoints)
 * lie on it. If so, split the edge at those vertices, sorted by parametric t.
 * This handles the case where a new wall is longer than an existing shared wall.
 */
function splitNewEdgeAtExistingVertices(
  geo: Geometry,
  edgeId: string,
  height: number,
  thickness: number,
): void {
  const edge = getEdge(geo, edgeId);
  if (!edge) return;

  const v1 = getVertex(geo, edge.vertexIds[0]);
  const v2 = getVertex(geo, edge.vertexIds[1]);
  if (!v1 || !v2) return;

  // Collect vertices that lie on this edge (with their t values)
  const splits: Array<{ vertex: GeoVertex; t: number }> = [];
  for (const v of geo.vertices) {
    if (v.id === edge.vertexIds[0] || v.id === edge.vertexIds[1]) continue;
    const t = pointOnEdge(geo, edge, v.x, v.y);
    if (t !== null) {
      splits.push({ vertex: v, t });
    }
  }

  if (splits.length === 0) return;

  // Sort by t so we split from start to end
  splits.sort((a, b) => a.t - b.t);

  // Remove the original edge
  const origV1Id = edge.vertexIds[0];
  const origV2Id = edge.vertexIds[1];
  const ov1 = getVertex(geo, origV1Id);
  const ov2 = getVertex(geo, origV2Id);
  if (ov1) ov1.edgeIds = ov1.edgeIds.filter(eid => eid !== edgeId);
  if (ov2) ov2.edgeIds = ov2.edgeIds.filter(eid => eid !== edgeId);
  geo.edges = geo.edges.filter(e => e.id !== edgeId);

  // Create chain of edges: v1 -> split[0] -> split[1] -> ... -> v2
  const chain = [origV1Id, ...splits.map(s => s.vertex.id), origV2Id];
  for (let i = 0; i < chain.length - 1; i++) {
    const aId = chain[i];
    const bId = chain[i + 1];
    // Skip if edge already exists (e.g. the shared wall segment)
    if (findEdgeBetween(geo, aId, bId)) continue;

    const newEdge: GeoEdge = {
      id: generateId('e_'),
      vertexIds: [aId, bId],
      faceIds: [],
      wallHeight: height,
      wallThickness: thickness,
      isExterior: true,
    };
    geo.edges.push(newEdge);
    const va = getVertex(geo, aId);
    const vb = getVertex(geo, bId);
    if (va) va.edgeIds.push(newEdge.id);
    if (vb) vb.edgeIds.push(newEdge.id);
  }
}

/**
 * Compute intersection point of two line segments (p1→p2) and (p3→p4).
 * Returns { x, y, t, u } if they intersect (0 < t < 1 and 0 < u < 1),
 * or null if they don't. t is parametric on first segment, u on second.
 */
function segmentIntersection(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): { x: number; y: number; t: number; u: number } | null {
  const d1x = p2x - p1x, d1y = p2y - p1y;
  const d2x = p4x - p3x, d2y = p4y - p3y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null; // parallel or collinear

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;

  // Strict interior intersection (exclude endpoints)
  if (t <= 0.01 || t >= 0.99 || u <= 0.01 || u >= 0.99) return null;

  return {
    x: p1x + t * d1x,
    y: p1y + t * d1y,
    t, u,
  };
}

/**
 * Find all intersection points between a line segment (v1→v2) and existing edges.
 * Creates vertices at intersection points and splits the existing edges.
 * Returns the list of new intersection vertices (sorted by t along v1→v2).
 */
function splitIntersectingEdges(
  geo: Geometry,
  v1: GeoVertex, v2: GeoVertex,
): GeoVertex[] {
  const intersections: Array<{ vertex: GeoVertex; t: number; edgeId: string }> = [];

  // Snapshot edges to avoid mutation during iteration
  const edgeSnapshot = [...geo.edges];

  for (const edge of edgeSnapshot) {
    // Skip edges that share an endpoint with v1 or v2
    if (edge.vertexIds.includes(v1.id) || edge.vertexIds.includes(v2.id)) continue;

    const ev1 = getVertex(geo, edge.vertexIds[0]);
    const ev2 = getVertex(geo, edge.vertexIds[1]);
    if (!ev1 || !ev2) continue;

    const hit = segmentIntersection(
      v1.x, v1.y, v2.x, v2.y,
      ev1.x, ev1.y, ev2.x, ev2.y,
    );
    if (!hit) continue;

    // Create vertex at intersection point
    const { vertex: iv, isNew } = findOrCreateVertex(geo, hit.x, hit.y, 0.05);
    if (isNew) {
      // Split the existing edge at the intersection vertex
      splitEdgeAtVertex(geo, edge.id, iv.id);
    }
    intersections.push({ vertex: iv, t: hit.t, edgeId: edge.id });
  }

  // Sort by t along v1→v2
  intersections.sort((a, b) => a.t - b.t);
  return intersections.map(i => i.vertex);
}

/**
 * Add a wall (edge) between two points. Snaps to existing vertices.
 * Returns the created/found edge.
 */
export function addWall(
  geo: Geometry,
  x1: number, y1: number,
  x2: number, y2: number,
  height: number = 3.0,
  thickness: number = 0.2,
  snapThreshold: number = 0.3,
): GeoEdge {
  const { vertex: v1 } = findOrCreateVertex(geo, x1, y1, snapThreshold);
  const { vertex: v2 } = findOrCreateVertex(geo, x2, y2, snapThreshold);

  // BUG-4: Split existing edges at new vertices (T-junction support)
  trySplitEdgesAtVertex(geo, v1);
  trySplitEdgesAtVertex(geo, v2);

  // X-junction: find intersections between the new wall line and existing edges,
  // create vertices at intersection points and split existing edges
  const intersectionVerts = splitIntersectingEdges(geo, v1, v2);

  if (intersectionVerts.length > 0) {
    // Build chain: v1 -> intersection[0] -> ... -> intersection[n] -> v2
    const chain = [v1, ...intersectionVerts, v2];
    let lastEdge: GeoEdge | null = null;
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      if (a.id === b.id) continue;
      const existing = findEdgeBetween(geo, a.id, b.id);
      if (existing) { lastEdge = existing; continue; }

      const seg: GeoEdge = {
        id: generateId('e_'),
        vertexIds: [a.id, b.id],
        faceIds: [],
        wallHeight: height,
        wallThickness: thickness,
        isExterior: true,
      };
      geo.edges.push(seg);
      a.edgeIds.push(seg.id);
      b.edgeIds.push(seg.id);
      lastEdge = seg;

      // Also split this segment at any existing vertices on it
      splitNewEdgeAtExistingVertices(geo, seg.id, height, thickness);
    }
    return lastEdge!;
  }

  // No intersections — simple case
  const existing = findEdgeBetween(geo, v1.id, v2.id);
  if (existing) return existing;

  const edge: GeoEdge = {
    id: generateId('e_'),
    vertexIds: [v1.id, v2.id],
    faceIds: [],
    wallHeight: height,
    wallThickness: thickness,
    isExterior: true,
  };
  geo.edges.push(edge);
  v1.edgeIds.push(edge.id);
  v2.edgeIds.push(edge.id);

  // Split the new edge at any existing vertices that lie on it.
  // This handles the case where the new wall is longer than an existing wall
  // sharing the same line — existing intermediate vertices must split the new edge.
  splitNewEdgeAtExistingVertices(geo, edge.id, height, thickness);

  return edge;
}

/**
 * Remove an edge and clean up vertex references
 */
export function removeEdge(geo: Geometry, edgeId: string): void {
  const edgeIdx = geo.edges.findIndex(e => e.id === edgeId);
  if (edgeIdx === -1) return;

  const edge = geo.edges[edgeIdx];

  // Remove edge from vertices
  for (const vId of edge.vertexIds) {
    const v = getVertex(geo, vId);
    if (v) {
      v.edgeIds = v.edgeIds.filter(eid => eid !== edgeId);
    }
  }

  // Remove edge
  geo.edges.splice(edgeIdx, 1);

  // Remove faces that reference this edge
  geo.faces = geo.faces.filter(f => !f.edgeIds.includes(edgeId));

  // Clean up orphan vertices (no edges)
  geo.vertices = geo.vertices.filter(v => v.edgeIds.length > 0);

  // Update exterior status of remaining edges
  updateEdgeExteriorStatus(geo);
}

/**
 * Detect closed faces (polygons) formed by edges.
 * Uses cycle detection in the planar graph.
 */
export function detectFaces(geo: Geometry): GeoFace[] {
  const faces: GeoFace[] = [];

  // Build adjacency: vertex -> [{neighborVertexId, edgeId}]
  const adj = new Map<string, Array<{ neighbor: string; edgeId: string }>>();
  for (const v of geo.vertices) {
    adj.set(v.id, []);
  }
  for (const e of geo.edges) {
    const [v1, v2] = e.vertexIds;
    adj.get(v1)?.push({ neighbor: v2, edgeId: e.id });
    adj.get(v2)?.push({ neighbor: v1, edgeId: e.id });
  }

  // Sort neighbors by angle for planar face detection
  for (const [vId, neighbors] of adj.entries()) {
    const v = getVertex(geo, vId)!;
    neighbors.sort((a, b) => {
      const va = getVertex(geo, a.neighbor)!;
      const vb = getVertex(geo, b.neighbor)!;
      const angleA = Math.atan2(va.y - v.y, va.x - v.x);
      const angleB = Math.atan2(vb.y - v.y, vb.x - v.x);
      return angleA - angleB;
    });
  }

  // Find minimal cycles using "next edge" traversal
  const usedHalfEdges = new Set<string>();

  function halfEdgeKey(from: string, to: string): string {
    return `${from}->${to}`;
  }

  function getNextHalfEdge(from: string, to: string): { next: string; edgeId: string } | null {
    const neighbors = adj.get(to);
    if (!neighbors || neighbors.length === 0) return null;

    // Find the index of 'from' in to's neighbor list
    const fromVertex = getVertex(geo, from)!;
    const toVertex = getVertex(geo, to)!;
    const incomingAngle = Math.atan2(fromVertex.y - toVertex.y, fromVertex.x - toVertex.x);

    // Find next neighbor: most clockwise turn from incoming direction
    let bestIdx = -1;
    let bestAngleDiff = -Infinity;

    for (let i = 0; i < neighbors.length; i++) {
      if (neighbors[i].neighbor === from && neighbors.length > 1) {
        // Skip going back unless it's the only option
        continue;
      }
      const nv = getVertex(geo, neighbors[i].neighbor)!;
      const outAngle = Math.atan2(nv.y - toVertex.y, nv.x - toVertex.x);
      let diff = outAngle - incomingAngle;
      // Normalize to (0, 2π]
      while (diff <= 0) diff += 2 * Math.PI;
      while (diff > 2 * Math.PI) diff -= 2 * Math.PI;
      if (diff > bestAngleDiff) {
        bestAngleDiff = diff;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // Only option is to go back
      const back = neighbors.find(n => n.neighbor === from);
      return back ? { next: back.neighbor, edgeId: back.edgeId } : null;
    }

    return { next: neighbors[bestIdx].neighbor, edgeId: neighbors[bestIdx].edgeId };
  }

  // Traverse all half-edges
  for (const edge of geo.edges) {
    for (const direction of [[edge.vertexIds[0], edge.vertexIds[1]], [edge.vertexIds[1], edge.vertexIds[0]]] as [string, string][]) {
      const [startFrom, startTo] = direction;
      const heKey = halfEdgeKey(startFrom, startTo);
      if (usedHalfEdges.has(heKey)) continue;

      // Trace a cycle
      const cycle: Array<{ from: string; to: string; edgeId: string }> = [];
      let current = startTo;
      let prev = startFrom;
      let firstEdgeId = edge.id;
      cycle.push({ from: startFrom, to: startTo, edgeId: firstEdgeId });
      usedHalfEdges.add(heKey);

      let maxIter = geo.vertices.length + 2;
      let foundCycle = false;

      while (maxIter-- > 0) {
        const next = getNextHalfEdge(prev, current);
        if (!next) break;

        const nextHeKey = halfEdgeKey(current, next.next);

        if (next.next === startFrom && cycle.length >= 2) {
          // Closing the cycle — allow even if half-edge was used
          cycle.push({ from: current, to: next.next, edgeId: next.edgeId });
          usedHalfEdges.add(nextHeKey);
          foundCycle = true;
          break;
        }

        if (usedHalfEdges.has(nextHeKey)) {
          break;
        }

        cycle.push({ from: current, to: next.next, edgeId: next.edgeId });
        usedHalfEdges.add(nextHeKey);
        prev = current;
        current = next.next;
      }

      if (foundCycle && cycle.length >= 3) {
        // Check if this is a valid interior face (not the outer boundary)
        // by computing signed area - positive = counter-clockwise = interior
        let signedArea = 0;
        for (const step of cycle) {
          const vFrom = getVertex(geo, step.from)!;
          const vTo = getVertex(geo, step.to)!;
          signedArea += (vFrom.x * vTo.y - vTo.x * vFrom.y);
        }
        signedArea /= 2;

        if (signedArea > 0.01) {  // positive area = valid interior face
          const edgeIds = cycle.map(s => s.edgeId);
          const edgeOrder = cycle.map(s => {
            const e = getEdge(geo, s.edgeId)!;
            return e.vertexIds[0] === s.from ? 0 : 1;
          }) as (0 | 1)[];

          // Check for duplicate face
          const edgeSet = new Set(edgeIds);
          const isDuplicate = faces.some(f => {
            if (f.edgeIds.length !== edgeIds.length) return false;
            const fSet = new Set(f.edgeIds);
            for (const eid of edgeSet) {
              if (!fSet.has(eid)) return false;
            }
            return true;
          });

          if (!isDuplicate) {
            faces.push({
              id: stableFaceId(edgeIds),
              edgeIds,
              edgeOrder,
            });
          }
        }
      }
    }
  }

  return faces;
}

/**
 * Recompute faces and update edge faceIds and exterior status
 */
export function rebuildFaces(geo: Geometry): void {
  // Clear old faces
  geo.faces = detectFaces(geo);

  // Reset edge faceIds
  for (const edge of geo.edges) {
    edge.faceIds = [];
  }

  // Assign faces to edges
  for (const face of geo.faces) {
    for (const edgeId of face.edgeIds) {
      const edge = getEdge(geo, edgeId);
      if (edge && !edge.faceIds.includes(face.id)) {
        edge.faceIds.push(face.id);
      }
    }
  }

  updateEdgeExteriorStatus(geo);
}

function updateEdgeExteriorStatus(geo: Geometry): void {
  // First pass: edges with 2+ faces are always interior
  for (const edge of geo.edges) {
    edge.isExterior = edge.faceIds.length <= 1;
  }

  // Second pass: for edges with only 1 face, check if the edge midpoint
  // lies inside another face (nested room case).
  // If so, the edge is interior (not exterior).
  for (const edge of geo.edges) {
    if (!edge.isExterior) continue; // already interior
    if (edge.faceIds.length === 0) continue; // dangling edge, always exterior

    const v1 = getVertex(geo, edge.vertexIds[0]);
    const v2 = getVertex(geo, edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;
    const ownFaceId = edge.faceIds[0];

    for (const face of geo.faces) {
      if (face.id === ownFaceId) continue; // skip own face
      const verts = getFaceVertices(geo, face);
      if (verts.length < 3) continue;
      if (pointInPolygon(midX, midY, verts)) {
        edge.isExterior = false;
        break;
      }
    }
  }
}

/**
 * Ray-casting point-in-polygon test
 */
export function pointInPolygon(px: number, py: number, verts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Get ordered vertices of a face (for rendering polygon)
 */
export function getFaceVertices(geo: Geometry, face: GeoFace): GeoVertex[] {
  const vertices: GeoVertex[] = [];
  for (let i = 0; i < face.edgeIds.length; i++) {
    const edge = getEdge(geo, face.edgeIds[i]);
    if (!edge) continue;
    const vId = face.edgeOrder[i] === 0 ? edge.vertexIds[0] : edge.vertexIds[1];
    const v = getVertex(geo, vId);
    if (v) vertices.push(v);
  }
  return vertices;
}

/**
 * Calculate face area using Shoelace formula
 */
export function faceArea(geo: Geometry, face: GeoFace): number {
  const verts = getFaceVertices(geo, face);
  if (verts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    area += verts[i].x * verts[j].y;
    area -= verts[j].x * verts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Get face centroid
 */
export function faceCentroid(geo: Geometry, face: GeoFace): { x: number; y: number } {
  const verts = getFaceVertices(geo, face);
  if (verts.length === 0) return { x: 0, y: 0 };
  const cx = verts.reduce((sum, v) => sum + v.x, 0) / verts.length;
  const cy = verts.reduce((sum, v) => sum + v.y, 0) / verts.length;
  return { x: cx, y: cy };
}
