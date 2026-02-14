/**
 * 2D Camera — screen↔world coordinate transforms, pan/zoom state
 *
 * World coordinates: X right, Y down, unit = meters
 * Screen coordinates: canvas pixels (CSS pixels × devicePixelRatio)
 *
 * Transform: screenPos = (worldPos × zoom) + pan + canvasCenter
 */

export interface Camera2D {
  panX: number;   // pixels, horizontal offset
  panY: number;   // pixels, vertical offset
  zoom: number;   // pixels per meter (world unit)
}

export const DEFAULT_CAMERA: Camera2D = {
  panX: 0,
  panY: 0,
  zoom: 50, // 50 px/m default
};

export const ZOOM_MIN = 5;
export const ZOOM_MAX = 500;

/** World → Screen (CSS pixel) */
export function worldToScreen(
  wx: number, wy: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
): { sx: number; sy: number } {
  return {
    sx: wx * camera.zoom + camera.panX + canvasW / 2,
    sy: wy * camera.zoom + camera.panY + canvasH / 2,
  };
}

/** Screen (CSS pixel) → World */
export function screenToWorld(
  sx: number, sy: number,
  camera: Camera2D,
  canvasW: number, canvasH: number,
): { wx: number; wy: number } {
  return {
    wx: (sx - camera.panX - canvasW / 2) / camera.zoom,
    wy: (sy - camera.panY - canvasH / 2) / camera.zoom,
  };
}

/** Zoom centered on a screen point */
export function zoomAtPoint(
  camera: Camera2D,
  screenX: number, screenY: number,
  canvasW: number, canvasH: number,
  delta: number, // positive = zoom in
): Camera2D {
  const factor = delta > 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.zoom * factor));
  const ratio = newZoom / camera.zoom;

  // Keep the world point under the cursor stationary
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const newPanX = screenX - ratio * (screenX - camera.panX - cx) - cx;
  const newPanY = screenY - ratio * (screenY - camera.panY - cy) - cy;

  return { panX: newPanX, panY: newPanY, zoom: newZoom };
}

/** Snap a world coordinate to grid */
export function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

/** World-space distance for a given screen-pixel distance */
export function screenDistToWorld(screenDist: number, zoom: number): number {
  return screenDist / zoom;
}
