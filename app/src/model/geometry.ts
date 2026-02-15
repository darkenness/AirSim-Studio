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

  // Fan
  maxFlow?: number;            // m³/s
  shutoffPressure?: number;    // Pa

  // Damper
  damperFraction?: number;     // 0~1 open fraction

  // Filter
  filterEfficiency?: number;   // 0~1 removal efficiency
}

// ── Story (Floor Level) ──

export interface Story {
  id: string;
  name: string;
  level: number;           // 0 = ground
  floorToCeilingHeight: number;  // meters
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
export function findOrCreateVertex(geo: Geometry, x: number, y: number, snapThreshold: number = 0.08): { vertex: GeoVertex; isNew: boolean } {
  for (const v of geo.vertices) {
    const dist = Math.sqrt((v.x - x) ** 2 + (v.y - y) ** 2);
    if (dist <= snapThreshold) {
      return { vertex: v, isNew: false };
    }
  }
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

  // Check if edge already exists
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

    // Find next neighbor clockwise after incoming direction
    let bestIdx = -1;
    let bestAngleDiff = Infinity;

    for (let i = 0; i < neighbors.length; i++) {
      if (neighbors[i].neighbor === from && neighbors.length > 1) {
        // Skip going back unless it's the only option
        continue;
      }
      const nv = getVertex(geo, neighbors[i].neighbor)!;
      const outAngle = Math.atan2(nv.y - toVertex.y, nv.x - toVertex.x);
      let diff = outAngle - incomingAngle;
      if (diff <= 0) diff += 2 * Math.PI;
      if (diff < bestAngleDiff) {
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
        if (usedHalfEdges.has(nextHeKey)) {
          if (next.next === startFrom && cycle.length >= 3) {
            cycle.push({ from: current, to: next.next, edgeId: next.edgeId });
            usedHalfEdges.add(nextHeKey);
            foundCycle = true;
          }
          break;
        }

        cycle.push({ from: current, to: next.next, edgeId: next.edgeId });
        usedHalfEdges.add(nextHeKey);
        prev = current;
        current = next.next;

        if (current === startFrom && cycle.length >= 3) {
          foundCycle = true;
          break;
        }
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
  for (const edge of geo.edges) {
    edge.isExterior = edge.faceIds.length <= 1;
  }
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
