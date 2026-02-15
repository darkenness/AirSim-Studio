/**
 * renderer.ts — Pure-function 2D rendering for the Canvas2D component.
 * All draw* functions receive (ctx, state, camera) and produce no side-effects.
 */

import type { Camera2D } from './camera2d';
import type { Geometry, GeoVertex, GeoEdge, EdgePlacement, ZoneAssignment } from '../model/geometry';
import { faceArea, edgeLength, getFaceVertices } from '../model/geometry';

// ── Lookup maps for O(1) vertex/edge access in hot paths ──

interface GeoMaps {
  vertexMap: Map<string, GeoVertex>;
  edgeMap: Map<string, GeoEdge>;
}

function buildGeoMaps(geo: Geometry): GeoMaps {
  return {
    vertexMap: new Map(geo.vertices.map(v => [v.id, v])),
    edgeMap: new Map(geo.edges.map(e => [e.id, e])),
  };
}

// ── Theme colors read from CSS variables ──

export interface ThemeColors {
  foreground: string;
  background: string;
  primary: string;
  border: string;
  muted: string;
  accent: string;
  destructive: string;
  card: string;
}

export function readThemeColors(): ThemeColors {
  const s = getComputedStyle(document.documentElement);
  const get = (v: string) => s.getPropertyValue(v).trim();
  return {
    foreground: `hsl(${get('--foreground')})`,
    background: `hsl(${get('--background')})`,
    primary: `hsl(${get('--primary')})`,
    border: `hsl(${get('--border')})`,
    muted: `hsl(${get('--muted')})`,
    accent: `hsl(${get('--accent')})`,
    destructive: `hsl(${get('--destructive')})`,
    card: `hsl(${get('--card')})`,
  };
}

// ── Dot Grid ──

export function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  gridSize: number,
  colors: ThemeColors,
): void {
  // Visible world bounds
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const left = (-camera.panX - cx) / camera.zoom;
  const top = (-camera.panY - cy) / camera.zoom;
  const right = left + canvasW / camera.zoom;
  const bottom = top + canvasH / camera.zoom;

  // Major grid: 1m intervals (always visible when reasonable)
  const majorSize = 1.0;
  const majorScreenSize = majorSize * camera.zoom;
  if (majorScreenSize >= 8) {
    const majorRadius = Math.max(1.5, camera.zoom * 0.025);
    const mStartX = Math.floor(left / majorSize) * majorSize;
    const mStartY = Math.floor(top / majorSize) * majorSize;
    ctx.fillStyle = colors.border;
    ctx.globalAlpha = 0.5;
    for (let wx = mStartX; wx <= right; wx += majorSize) {
      for (let wy = mStartY; wy <= bottom; wy += majorSize) {
        const sx = wx * camera.zoom + camera.panX + cx;
        const sy = wy * camera.zoom + camera.panY + cy;
        ctx.beginPath();
        ctx.arc(sx, sy, majorRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Minor grid: gridSize intervals (only when zoomed in enough)
  if (gridSize < majorSize) {
    const minorScreenSize = gridSize * camera.zoom;
    if (minorScreenSize >= 8) {
      const minorRadius = Math.max(0.8, camera.zoom * 0.012);
      const sStartX = Math.floor(left / gridSize) * gridSize;
      const sStartY = Math.floor(top / gridSize) * gridSize;
      ctx.fillStyle = colors.border;
      ctx.globalAlpha = 0.25;
      for (let wx = sStartX; wx <= right; wx += gridSize) {
        for (let wy = sStartY; wy <= bottom; wy += gridSize) {
          // Skip major grid points (already drawn)
          const isMajorX = Math.abs(wx - Math.round(wx / majorSize) * majorSize) < 1e-6;
          const isMajorY = Math.abs(wy - Math.round(wy / majorSize) * majorSize) < 1e-6;
          if (isMajorX && isMajorY) continue;
          const sx = wx * camera.zoom + camera.panX + cx;
          const sy = wy * camera.zoom + camera.panY + cy;
          ctx.beginPath();
          ctx.arc(sx, sy, minorRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.globalAlpha = 1.0;
}

// ── Zone fills (semi-transparent polygons) ──

export function drawZones(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  zones: ZoneAssignment[],
  camera: Camera2D,
  canvasW: number, canvasH: number,
  selectedFaceId: string | null,
  hoveredFaceId: string | null,
  colors: ThemeColors,
): void {
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  for (const face of geo.faces) {
    const zone = zones.find(z => z.faceId === face.id);
    if (!zone) continue;

    // Build ordered vertex list for the face polygon
    const verts = getFaceVertices(geo, face);
    if (verts.length < 3) continue;

    ctx.beginPath();
    const first = verts[0];
    ctx.moveTo(first.x * camera.zoom + camera.panX + cx, first.y * camera.zoom + camera.panY + cy);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x * camera.zoom + camera.panX + cx, verts[i].y * camera.zoom + camera.panY + cy);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = zone.color;
    ctx.globalAlpha = face.id === selectedFaceId ? 0.4 : face.id === hoveredFaceId ? 0.3 : 0.2;
    ctx.fill();

    // Label
    ctx.globalAlpha = 1.0;
    if (camera.zoom > 15) {
      const centroid = getCentroid(verts);
      const sx = centroid.x * camera.zoom + camera.panX + cx;
      const sy = centroid.y * camera.zoom + camera.panY + cy;
      const fontSize = Math.max(10, Math.min(14, camera.zoom * 0.25));
      ctx.font = `${fontSize}px 'DM Sans', system-ui`;
      ctx.fillStyle = colors.foreground;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.name, sx, sy);
    }
    ctx.globalAlpha = 1.0;
  }
}

// ── Walls (thick orthogonal lines) ──

const WALL_THICKNESS_M = 0.15; // 15cm wall thickness in world units

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  selectedEdgeId: string | null,
  hoveredEdgeId: string | null,
  colors: ThemeColors,
): void {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const { vertexMap } = buildGeoMaps(geo);

  for (const edge of geo.edges) {
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const sx1 = v1.x * camera.zoom + camera.panX + cx;
    const sy1 = v1.y * camera.zoom + camera.panY + cy;
    const sx2 = v2.x * camera.zoom + camera.panX + cx;
    const sy2 = v2.y * camera.zoom + camera.panY + cy;

    const isSelected = edge.id === selectedEdgeId;
    const isHovered = edge.id === hoveredEdgeId;
    const isExterior = edge.isExterior;

    // Wall thickness in screen px
    const thickness = Math.max(2, WALL_THICKNESS_M * camera.zoom);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isSelected) {
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = thickness + 2;
    } else if (isHovered) {
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = thickness + 1;
      ctx.globalAlpha = 0.8;
    } else {
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = thickness;
      ctx.globalAlpha = isExterior ? 0.7 : 0.55;
    }

    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Exterior walls get a slightly thicker outline
    if (isExterior && !isSelected && !isHovered) {
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = thickness + 1;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }
}

// ── Vertices (small dots at corners) ──

export function drawVertices(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  snapVertexId: string | null,
  colors: ThemeColors,
): void {
  if (camera.zoom < 15) return; // too small to show vertices

  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const radius = Math.max(2.5, camera.zoom * 0.06);

  for (const v of geo.vertices) {
    const sx = v.x * camera.zoom + camera.panX + cx;
    const sy = v.y * camera.zoom + camera.panY + cy;

    const isSnapped = v.id === snapVertexId;
    ctx.beginPath();
    ctx.arc(sx, sy, isSnapped ? radius * 1.8 : radius, 0, Math.PI * 2);
    ctx.fillStyle = isSnapped ? colors.primary : colors.foreground;
    ctx.globalAlpha = isSnapped ? 0.9 : 0.4;
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

// ── Placements (doors, windows, etc. on edges) ──

export function drawPlacements(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  placements: EdgePlacement[],
  camera: Camera2D,
  canvasW: number, canvasH: number,
  selectedPlacementId: string | null,
  colors: ThemeColors,
): void {
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const { vertexMap, edgeMap } = buildGeoMaps(geo);

  for (const pl of placements) {
    const edge = edgeMap.get(pl.edgeId);
    if (!edge) continue;
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    // Position along edge
    const wx = v1.x + (v2.x - v1.x) * pl.alpha;
    const wy = v1.y + (v2.y - v1.y) * pl.alpha;
    const sx = wx * camera.zoom + camera.panX + cx;
    const sy = wy * camera.zoom + camera.panY + cy;

    const isSelected = pl.id === selectedPlacementId;
    const size = Math.max(6, camera.zoom * 0.18);

    // Edge direction for perpendicular icon
    const edx = v2.x - v1.x;
    const edy = v2.y - v1.y;
    const elen = Math.sqrt(edx * edx + edy * edy);
    const nx = elen > 0 ? -edy / elen : 0; // normal
    const ny = elen > 0 ? edx / elen : 0;

    if (pl.type === 'door') {
      drawDoorIcon(ctx, sx, sy, size, nx, ny, camera, isSelected, !pl.isConfigured, colors);
    } else if (pl.type === 'window') {
      drawWindowIcon(ctx, sx, sy, size, edx / (elen || 1), edy / (elen || 1), camera, isSelected, !pl.isConfigured, colors);
    } else {
      // Generic placement icon (small square + type letter)
      ctx.fillStyle = isSelected ? colors.primary : (!pl.isConfigured ? '#f59e0b' : colors.accent);
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      if (camera.zoom > 20) {
        ctx.fillStyle = colors.background;
        ctx.font = `bold ${Math.max(8, size * 0.7)}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pl.type[0].toUpperCase(), sx, sy);
      }
    }
  }
}

function drawDoorIcon(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, size: number,
  nx: number, ny: number,
  camera: Camera2D,
  isSelected: boolean, unconfigured: boolean,
  colors: ThemeColors,
): void {
  const gap = size * 0.8;
  const arcR = size * 1.2;

  // Gap in wall (clear)
  ctx.strokeStyle = unconfigured ? '#f59e0b' : (isSelected ? colors.primary : colors.foreground);
  ctx.lineWidth = Math.max(1.5, camera.zoom * 0.03);

  // Door arc (90° swing)
  ctx.beginPath();
  const angle0 = Math.atan2(ny, nx);
  ctx.arc(sx - nx * gap * 0.4, sy - ny * gap * 0.4, arcR, angle0 - Math.PI / 2, angle0, false);
  ctx.stroke();
}

function drawWindowIcon(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, size: number,
  dx: number, dy: number,
  camera: Camera2D,
  isSelected: boolean, unconfigured: boolean,
  colors: ThemeColors,
): void {
  ctx.strokeStyle = unconfigured ? '#f59e0b' : (isSelected ? colors.primary : colors.foreground);
  ctx.lineWidth = Math.max(1.5, camera.zoom * 0.03);

  const halfLen = size * 0.7;
  const gap = size * 0.15;

  // Double line across wall (window symbol)
  for (const offset of [-gap, gap]) {
    const ox = -dy * offset;
    const oy = dx * offset;
    ctx.beginPath();
    ctx.moveTo(sx + ox - dx * halfLen, sy + oy - dy * halfLen);
    ctx.lineTo(sx + ox + dx * halfLen, sy + oy + dy * halfLen);
    ctx.stroke();
  }
}

// ── Wall preview (dashed line for wall being drawn) ──

export function drawWallPreview(
  ctx: CanvasRenderingContext2D,
  startX: number, startY: number,
  endX: number, endY: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  colors: ThemeColors,
): void {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const sx1 = startX * camera.zoom + camera.panX + cx;
  const sy1 = startY * camera.zoom + camera.panY + cy;
  const sx2 = endX * camera.zoom + camera.panX + cx;
  const sy2 = endY * camera.zoom + camera.panY + cy;

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = Math.max(2, WALL_THICKNESS_M * camera.zoom);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;

  // Length label
  const dx = endX - startX;
  const dy = endY - startY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.1 && camera.zoom > 10) {
    const midSx = (sx1 + sx2) / 2;
    const midSy = (sy1 + sy2) / 2;
    const fontSize = Math.max(10, Math.min(13, camera.zoom * 0.2));
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = colors.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${len.toFixed(2)}m`, midSx, midSy - 4);
  }
}

// ── Rectangle preview (dashed rect for rect tool) ──

export function drawRectPreview(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  colors: ThemeColors,
): void {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const sx1 = x1 * camera.zoom + camera.panX + cx;
  const sy1 = y1 * camera.zoom + camera.panY + cy;
  const sx2 = x2 * camera.zoom + camera.panX + cx;
  const sy2 = y2 * camera.zoom + camera.panY + cy;

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = Math.max(2, WALL_THICKNESS_M * camera.zoom);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(
    Math.min(sx1, sx2), Math.min(sy1, sy2),
    Math.abs(sx2 - sx1), Math.abs(sy2 - sy1),
  );
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;

  // Dimension labels
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  if (w > 0.1 && h > 0.1 && camera.zoom > 10) {
    const fontSize = Math.max(10, Math.min(13, camera.zoom * 0.2));
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = colors.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const midTop = (sx1 + sx2) / 2;
    ctx.fillText(`${w.toFixed(2)}m`, midTop, Math.min(sy1, sy2) - 4);
    ctx.save();
    ctx.translate(Math.min(sx1, sx2) - 4, (sy1 + sy2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${h.toFixed(2)}m`, 0, 0);
    ctx.restore();
  }
}

// ── Crosshair cursor (screen space) ──

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  colors: ThemeColors,
): void {
  const len = 12;
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(sx - len, sy);
  ctx.lineTo(sx + len, sy);
  ctx.moveTo(sx, sy - len);
  ctx.lineTo(sx, sy + len);
  ctx.stroke();
  ctx.globalAlpha = 1.0;
}

// ── Background image ──

export function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  opacity: number,
  scalePixelsPerMeter: number,
  offsetX: number, offsetY: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): void {
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const worldWidth = img.naturalWidth / scalePixelsPerMeter;
  const worldHeight = img.naturalHeight / scalePixelsPerMeter;

  const sx = offsetX * camera.zoom + camera.panX + cx;
  const sy = offsetY * camera.zoom + camera.panY + cy;
  const sw = worldWidth * camera.zoom;
  const sh = worldHeight * camera.zoom;

  ctx.globalAlpha = opacity;

  if (rotation === 0) {
    ctx.drawImage(img, sx, sy, sw, sh);
  } else {
    ctx.save();
    const radians = (rotation * Math.PI) / 180;
    // Rotate around the center of the image
    const imgCx = sx + sw / 2;
    const imgCy = sy + sh / 2;
    ctx.translate(imgCx, imgCy);
    ctx.rotate(radians);
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  ctx.globalAlpha = 1.0;
}

// ── Results overlay: flow arrows on edges ──

export interface EdgeFlowResult {
  edgeId: string;
  massFlow: number;  // kg/s, positive = v1→v2
  deltaP: number;    // Pa
}

export interface ZoneConcentrationResult {
  faceId: string;
  concentration: number; // kg/kg or ppm
  pressure: number;      // Pa (gauge)
}

export function drawFlowArrows(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  flows: EdgeFlowResult[],
  camera: Camera2D,
  canvasW: number, canvasH: number,
  _colors: ThemeColors,
): void {
  if (flows.length === 0) return;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const { vertexMap, edgeMap } = buildGeoMaps(geo);

  const maxFlow = Math.max(1e-10, ...flows.map(f => Math.abs(f.massFlow)));

  for (const f of flows) {
    const edge = edgeMap.get(f.edgeId);
    if (!edge) continue;
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const midWx = (v1.x + v2.x) / 2;
    const midWy = (v1.y + v2.y) / 2;
    const midSx = midWx * camera.zoom + camera.panX + cx;
    const midSy = midWy * camera.zoom + camera.panY + cy;

    // Edge direction
    const edx = v2.x - v1.x;
    const edy = v2.y - v1.y;
    const elen = Math.sqrt(edx * edx + edy * edy);
    if (elen < 0.01) continue;

    // Normal (perpendicular to edge)
    const nx = -edy / elen;
    const ny = edx / elen;

    // Arrow direction: along normal, sign based on flow direction
    const sign = f.massFlow >= 0 ? 1 : -1;
    const arrowLen = Math.max(8, Math.min(30, (Math.abs(f.massFlow) / maxFlow) * 25 * (camera.zoom / 50)));

    const ax = nx * sign;
    const ay = ny * sign;

    // Arrow tip
    const tipX = midSx + ax * arrowLen;
    const tipY = midSy + ay * arrowLen;

    // Arrow color: blue for positive, red for negative
    const isPositive = f.massFlow >= 0;
    ctx.strokeStyle = isPositive ? '#3b82f6' : '#ef4444';
    ctx.fillStyle = isPositive ? '#3b82f6' : '#ef4444';
    ctx.lineWidth = Math.max(1.5, camera.zoom * 0.03);
    ctx.globalAlpha = 0.8;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(midSx, midSy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    const headLen = Math.max(4, arrowLen * 0.35);
    const headAngle = Math.atan2(ay, ax);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(headAngle - 0.4), tipY - headLen * Math.sin(headAngle - 0.4));
    ctx.lineTo(tipX - headLen * Math.cos(headAngle + 0.4), tipY - headLen * Math.sin(headAngle + 0.4));
    ctx.closePath();
    ctx.fill();

    // Flow label
    if (camera.zoom > 25) {
      const fontSize = Math.max(9, Math.min(12, camera.zoom * 0.18));
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.9;
      const labelX = midSx + ax * (arrowLen + 10);
      const labelY = midSy + ay * (arrowLen + 10);
      const flowStr = Math.abs(f.massFlow) < 0.001
        ? `${(f.massFlow * 1000).toFixed(2)} g/s`
        : `${f.massFlow.toFixed(4)} kg/s`;
      ctx.fillText(flowStr, labelX, labelY);
    }

    ctx.globalAlpha = 1.0;
  }
}

export function drawPressureLabels(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  flows: EdgeFlowResult[],
  camera: Camera2D,
  canvasW: number, canvasH: number,
  _colors: ThemeColors,
): void {
  if (flows.length === 0 || camera.zoom < 30) return;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const { vertexMap, edgeMap } = buildGeoMaps(geo);

  for (const f of flows) {
    if (Math.abs(f.deltaP) < 1e-6) continue;
    const edge = edgeMap.get(f.edgeId);
    if (!edge) continue;
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const midSx = ((v1.x + v2.x) / 2) * camera.zoom + camera.panX + cx;
    const midSy = ((v1.y + v2.y) / 2) * camera.zoom + camera.panY + cy;

    const fontSize = Math.max(8, Math.min(11, camera.zoom * 0.15));
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#a855f7'; // purple for pressure
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.7;
    ctx.fillText(`ΔP=${f.deltaP.toFixed(2)} Pa`, midSx, midSy + 6);
    ctx.globalAlpha = 1.0;
  }
}

export function drawConcentrationHeatmap(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  zoneResults: ZoneConcentrationResult[],
  camera: Camera2D,
  canvasW: number, canvasH: number,
): void {
  if (zoneResults.length === 0) return;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const maxConc = Math.max(1e-10, ...zoneResults.map(z => z.concentration));

  for (const zr of zoneResults) {
    const face = geo.faces.find(f => f.id === zr.faceId);
    if (!face) continue;

    const verts = getFaceVertices(geo, face);
    if (verts.length < 3) continue;

    ctx.beginPath();
    ctx.moveTo(verts[0].x * camera.zoom + camera.panX + cx, verts[0].y * camera.zoom + camera.panY + cy);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x * camera.zoom + camera.panX + cx, verts[i].y * camera.zoom + camera.panY + cy);
    }
    ctx.closePath();

    // Heat color: green(low) → yellow(mid) → red(high)
    const ratio = Math.min(1, zr.concentration / maxConc);
    const r = Math.round(ratio < 0.5 ? ratio * 2 * 255 : 255);
    const g = Math.round(ratio < 0.5 ? 255 : (1 - (ratio - 0.5) * 2) * 255);
    ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
    ctx.globalAlpha = 0.35;
    ctx.fill();

    // Concentration label
    if (camera.zoom > 20) {
      const centroid = getCentroid(verts);
      const csx = centroid.x * camera.zoom + camera.panX + cx;
      const csy = centroid.y * camera.zoom + camera.panY + cy;
      const fontSize = Math.max(9, Math.min(12, camera.zoom * 0.2));
      ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.8;
      ctx.fillText(`${(zr.concentration * 1e6).toFixed(0)} ppm`, csx, csy + fontSize + 2);
    }
    ctx.globalAlpha = 1.0;
  }
}

// ── Wind pressure visualization (Cp vectors on exterior walls) ──

export interface WallCpData {
  edgeId: string;
  cp: number;       // pressure coefficient
  azimuth: number;  // wall azimuth (degrees)
}

export function drawWindPressureVectors(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  cpData: WallCpData[],
  _windDirection: number,  // degrees (reserved for future directional rendering)
  windSpeed: number,      // m/s
  camera: Camera2D,
  canvasW: number, canvasH: number,
  _colors: ThemeColors,
): void {
  if (cpData.length === 0 || windSpeed < 0.01) return;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const { vertexMap, edgeMap } = buildGeoMaps(geo);

  const maxCp = Math.max(0.01, ...cpData.map(d => Math.abs(d.cp)));

  for (const d of cpData) {
    const edge = edgeMap.get(d.edgeId);
    if (!edge || !edge.isExterior) continue;
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const midWx = (v1.x + v2.x) / 2;
    const midWy = (v1.y + v2.y) / 2;
    const midSx = midWx * camera.zoom + camera.panX + cx;
    const midSy = midWy * camera.zoom + camera.panY + cy;

    // Normal direction (outward from exterior wall)
    const edx = v2.x - v1.x;
    const edy = v2.y - v1.y;
    const elen = Math.sqrt(edx * edx + edy * edy);
    if (elen < 0.01) continue;
    const nx = -edy / elen;
    const ny = edx / elen;

    // Arrow length proportional to |Cp|
    const arrowLen = Math.max(10, (Math.abs(d.cp) / maxCp) * 30 * (camera.zoom / 50));
    const isPositive = d.cp >= 0;

    // Positive Cp = pressure INTO wall = arrow pointing inward
    const dir = isPositive ? -1 : 1;
    const tipX = midSx + nx * dir * arrowLen;
    const tipY = midSy + ny * dir * arrowLen;

    ctx.strokeStyle = isPositive ? '#f97316' : '#06b6d4'; // orange=pressure, cyan=suction
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1.5, camera.zoom * 0.025);
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.moveTo(midSx, midSy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    const headLen = Math.max(4, arrowLen * 0.3);
    const angle = Math.atan2(ny * dir, nx * dir);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - 0.4), tipY - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(tipX - headLen * Math.cos(angle + 0.4), tipY - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    // Cp label
    if (camera.zoom > 25) {
      const fontSize = Math.max(8, Math.min(11, camera.zoom * 0.15));
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Cp=${d.cp.toFixed(2)}`, tipX + nx * dir * 12, tipY + ny * dir * 12);
    }
    ctx.globalAlpha = 1.0;
  }
}

// ── Scaled dimension labels on walls ──

export function drawWallDimensions(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  scaleFactor: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  colors: ThemeColors,
): void {
  if (camera.zoom < 18) return; // too zoomed out for labels
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const { vertexMap } = buildGeoMaps(geo);
  const fontSize = Math.max(9, Math.min(12, camera.zoom * 0.16));

  ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = 0.75;

  for (const edge of geo.edges) {
    const v1 = vertexMap.get(edge.vertexIds[0]);
    const v2 = vertexMap.get(edge.vertexIds[1]);
    if (!v1 || !v2) continue;

    const len = edgeLength(geo, edge);
    if (len < 0.05) continue;

    const physLen = len * scaleFactor;
    const label = physLen < 1
      ? `${(physLen * 100).toFixed(0)}cm`
      : `${physLen.toFixed(2)}m`;

    const sx1 = v1.x * camera.zoom + camera.panX + cx;
    const sy1 = v1.y * camera.zoom + camera.panY + cy;
    const sx2 = v2.x * camera.zoom + camera.panX + cx;
    const sy2 = v2.y * camera.zoom + camera.panY + cy;
    const midX = (sx1 + sx2) / 2;
    const midY = (sy1 + sy2) / 2;

    // Offset label perpendicular to edge so it doesn't overlap the wall
    const edx = v2.x - v1.x;
    const edy = v2.y - v1.y;
    const elen = Math.sqrt(edx * edx + edy * edy);
    const nx = elen > 0 ? -edy / elen : 0;
    const ny = elen > 0 ? edx / elen : 0;
    const offset = Math.max(8, camera.zoom * 0.15);

    ctx.fillText(label, midX + nx * offset, midY + ny * offset);
  }

  ctx.globalAlpha = 1.0;
}

// ── Scaled area labels on zones ──

export function drawZoneAreaLabels(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  zones: ZoneAssignment[],
  scaleFactor: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  colors: ThemeColors,
): void {
  if (camera.zoom < 15) return;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const sf2 = scaleFactor * scaleFactor;

  for (const face of geo.faces) {
    const zone = zones.find(z => z.faceId === face.id);
    if (!zone) continue;

    const verts = getFaceVertices(geo, face);
    if (verts.length < 3) continue;

    const area = faceArea(geo, face) * sf2;
    const centroid = getCentroid(verts);
    const sx = centroid.x * camera.zoom + camera.panX + cx;
    const sy = centroid.y * camera.zoom + camera.panY + cy;

    const fontSize = Math.max(8, Math.min(11, camera.zoom * 0.18));
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.65;
    ctx.fillText(`${area.toFixed(1)} m²`, sx, sy + fontSize * 0.8);
    ctx.globalAlpha = 1.0;
  }
}

// ── Calibration overlay (two-point line) ──

export function drawCalibrationOverlay(
  ctx: CanvasRenderingContext2D,
  point1: { x: number; y: number } | null,
  point2: { x: number; y: number } | null,
  camera: Camera2D,
  canvasW: number, canvasH: number,
  colors: ThemeColors,
): void {
  if (!point1) return;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const sx1 = point1.x * camera.zoom + camera.panX + cx;
  const sy1 = point1.y * camera.zoom + camera.panY + cy;

  // Draw first point marker
  ctx.fillStyle = colors.destructive;
  ctx.beginPath();
  ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
  ctx.fill();

  if (point2) {
    const sx2 = point2.x * camera.zoom + camera.panX + cx;
    const sy2 = point2.y * camera.zoom + camera.panY + cy;

    // Draw second point marker
    ctx.beginPath();
    ctx.arc(sx2, sy2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw dashed line between points
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = colors.destructive;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Show grid distance label at midpoint
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const gridDist = Math.sqrt(dx * dx + dy * dy);
    const midX = (sx1 + sx2) / 2;
    const midY = (sy1 + sy2) / 2;
    const fontSize = Math.max(11, Math.min(14, camera.zoom * 0.22));
    ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = colors.destructive;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${gridDist.toFixed(2)} grid units`, midX, midY - 6);
    ctx.globalAlpha = 1.0;
  }
}

// ── Helpers ──

function getCentroid(pts: { x: number; y: number }[]): { x: number; y: number } {
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  return { x: sx / pts.length, y: sy / pts.length };
}
