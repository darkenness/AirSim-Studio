import { describe, it, expect } from 'vitest';
import {
  worldToScreen,
  screenToWorld,
  zoomAtPoint,
  snapToGrid,
  screenDistToWorld,
  DEFAULT_CAMERA,
  ZOOM_MIN,
  ZOOM_MAX,
} from '../canvas/camera2d';
import type { Camera2D } from '../canvas/camera2d';

const W = 800;
const H = 600;

describe('camera2d.ts', () => {
  // ── worldToScreen / screenToWorld round-trip ──
  describe('worldToScreen + screenToWorld round-trip', () => {
    it('round-trips with default camera at origin', () => {
      const camera = { ...DEFAULT_CAMERA };
      const { sx, sy } = worldToScreen(0, 0, camera, W, H);
      const { wx, wy } = screenToWorld(sx, sy, camera, W, H);
      expect(wx).toBeCloseTo(0, 10);
      expect(wy).toBeCloseTo(0, 10);
    });

    it('round-trips with default camera at arbitrary point', () => {
      const camera = { ...DEFAULT_CAMERA };
      const { sx, sy } = worldToScreen(3.5, -2.1, camera, W, H);
      const { wx, wy } = screenToWorld(sx, sy, camera, W, H);
      expect(wx).toBeCloseTo(3.5, 10);
      expect(wy).toBeCloseTo(-2.1, 10);
    });

    it('round-trips with panned camera', () => {
      const camera: Camera2D = { panX: 100, panY: -50, zoom: 80 };
      const { sx, sy } = worldToScreen(7, 4, camera, W, H);
      const { wx, wy } = screenToWorld(sx, sy, camera, W, H);
      expect(wx).toBeCloseTo(7, 10);
      expect(wy).toBeCloseTo(4, 10);
    });

    it('round-trips at different zoom levels', () => {
      for (const zoom of [10, 50, 100, 300]) {
        const camera: Camera2D = { panX: 0, panY: 0, zoom };
        const { sx, sy } = worldToScreen(-5, 12, camera, W, H);
        const { wx, wy } = screenToWorld(sx, sy, camera, W, H);
        expect(wx).toBeCloseTo(-5, 10);
        expect(wy).toBeCloseTo(12, 10);
      }
    });
  });

  // ── worldToScreen specifics ──
  describe('worldToScreen', () => {
    it('maps world origin to canvas center with zero pan', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 50 };
      const { sx, sy } = worldToScreen(0, 0, camera, W, H);
      expect(sx).toBe(W / 2);
      expect(sy).toBe(H / 2);
    });

    it('applies zoom scaling', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 100 };
      const { sx, sy } = worldToScreen(1, 0, camera, W, H);
      // 1m * 100px/m + 0 + 400 = 500
      expect(sx).toBe(500);
      expect(sy).toBe(H / 2);
    });

    it('applies pan offset', () => {
      const camera: Camera2D = { panX: 20, panY: -10, zoom: 50 };
      const { sx, sy } = worldToScreen(0, 0, camera, W, H);
      expect(sx).toBe(W / 2 + 20);
      expect(sy).toBe(H / 2 - 10);
    });
  });

  // ── screenToWorld specifics ──
  describe('screenToWorld', () => {
    it('maps canvas center to world origin with zero pan', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 50 };
      const { wx, wy } = screenToWorld(W / 2, H / 2, camera, W, H);
      expect(wx).toBe(0);
      expect(wy).toBe(0);
    });

    it('maps top-left corner correctly', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 50 };
      const { wx, wy } = screenToWorld(0, 0, camera, W, H);
      expect(wx).toBeCloseTo(-W / 2 / 50, 10);
      expect(wy).toBeCloseTo(-H / 2 / 50, 10);
    });
  });

  // ── zoomAtPoint ──
  describe('zoomAtPoint', () => {
    it('zooms in (positive delta increases zoom)', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 50 };
      const result = zoomAtPoint(camera, W / 2, H / 2, W, H, 1);
      expect(result.zoom).toBeGreaterThan(50);
    });

    it('zooms out (negative delta decreases zoom)', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 50 };
      const result = zoomAtPoint(camera, W / 2, H / 2, W, H, -1);
      expect(result.zoom).toBeLessThan(50);
    });

    it('clamps zoom to ZOOM_MIN', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: ZOOM_MIN };
      const result = zoomAtPoint(camera, W / 2, H / 2, W, H, -1);
      expect(result.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    });

    it('clamps zoom to ZOOM_MAX', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: ZOOM_MAX };
      const result = zoomAtPoint(camera, W / 2, H / 2, W, H, 1);
      expect(result.zoom).toBeLessThanOrEqual(ZOOM_MAX);
    });

    it('keeps world point under cursor stationary when zooming at center', () => {
      const camera: Camera2D = { panX: 0, panY: 0, zoom: 50 };
      const sx = W / 2;
      const sy = H / 2;

      // World point under cursor before zoom
      const before = screenToWorld(sx, sy, camera, W, H);
      const newCam = zoomAtPoint(camera, sx, sy, W, H, 1);
      const after = screenToWorld(sx, sy, newCam, W, H);

      expect(after.wx).toBeCloseTo(before.wx, 5);
      expect(after.wy).toBeCloseTo(before.wy, 5);
    });

    it('keeps world point under cursor stationary when zooming off-center', () => {
      const camera: Camera2D = { panX: 30, panY: -20, zoom: 80 };
      const sx = 200;
      const sy = 150;

      const before = screenToWorld(sx, sy, camera, W, H);
      const newCam = zoomAtPoint(camera, sx, sy, W, H, 1);
      const after = screenToWorld(sx, sy, newCam, W, H);

      expect(after.wx).toBeCloseTo(before.wx, 5);
      expect(after.wy).toBeCloseTo(before.wy, 5);
    });

    it('keeps world point stationary on zoom out', () => {
      const camera: Camera2D = { panX: -50, panY: 40, zoom: 120 };
      const sx = 600;
      const sy = 400;

      const before = screenToWorld(sx, sy, camera, W, H);
      const newCam = zoomAtPoint(camera, sx, sy, W, H, -1);
      const after = screenToWorld(sx, sy, newCam, W, H);

      expect(after.wx).toBeCloseTo(before.wx, 5);
      expect(after.wy).toBeCloseTo(before.wy, 5);
    });
  });

  // ── snapToGrid ──
  describe('snapToGrid', () => {
    it('snaps to nearest grid line', () => {
      expect(snapToGrid(0.14, 0.1)).toBeCloseTo(0.1);
      expect(snapToGrid(0.16, 0.1)).toBeCloseTo(0.2);
    });

    it('snaps exact grid values to themselves', () => {
      expect(snapToGrid(0.5, 0.5)).toBeCloseTo(0.5);
      expect(snapToGrid(1.0, 0.1)).toBeCloseTo(1.0);
    });

    it('handles negative values', () => {
      expect(snapToGrid(-0.14, 0.1)).toBeCloseTo(-0.1);
      expect(snapToGrid(-0.16, 0.1)).toBeCloseTo(-0.2);
    });

    it('snaps to zero', () => {
      expect(snapToGrid(0.04, 0.1)).toBeCloseTo(0.0);
    });

    it('works with larger grid sizes', () => {
      expect(snapToGrid(1.3, 1.0)).toBeCloseTo(1.0);
      expect(snapToGrid(1.7, 1.0)).toBeCloseTo(2.0);
    });
  });

  // ── screenDistToWorld ──
  describe('screenDistToWorld', () => {
    it('converts screen pixels to world meters', () => {
      expect(screenDistToWorld(100, 50)).toBeCloseTo(2.0);
    });

    it('returns 0 for 0 screen distance', () => {
      expect(screenDistToWorld(0, 50)).toBe(0);
    });

    it('scales inversely with zoom', () => {
      const d1 = screenDistToWorld(100, 50);
      const d2 = screenDistToWorld(100, 100);
      expect(d1).toBeCloseTo(d2 * 2);
    });
  });
});
