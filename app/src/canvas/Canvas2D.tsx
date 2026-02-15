/**
 * Canvas2D.tsx — Main 2D canvas component (Excalidraw-style).
 * Replaces IsometricCanvas (Three.js 2.5D).
 *
 * Responsibilities:
 *   - Mount <canvas> with DPI-aware sizing
 *   - requestAnimationFrame render loop (dirty-flag driven)
 *   - Mouse/wheel/keyboard event dispatch
 *   - Pan (left-drag on empty / space+drag), zoom (wheel)
 *   - Tool-mode dispatching: select, wall, rect, door, window, erase
 */

import { useRef, useEffect, useCallback } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '../store/useAppStore';
import type { Camera2D } from './camera2d';
import {
  DEFAULT_CAMERA,
  screenToWorld, zoomAtPoint, snapToGrid, screenDistToWorld,
} from './camera2d';
import {
  drawDotGrid, drawZones, drawWalls, drawVertices,
  drawPlacements, drawWallPreview, drawRectPreview,
  drawCrosshair, readThemeColors,
  drawFlowArrows, drawPressureLabels, drawConcentrationHeatmap,
  drawBackgroundImage, drawWindPressureVectors,
  drawWallDimensions, drawZoneAreaLabels, drawCalibrationOverlay,
  type ThemeColors,
  type EdgeFlowResult,
  type ZoneConcentrationResult,
  type WallCpData,
} from './renderer';
import {
  constrainOrthogonal, findNearestVertex,
  hitTest, computeAlphaOnEdge,
} from './interaction';
import { CanvasContextMenu } from './components/ContextMenu';
import { FloorSwitcher } from './components/FloorSwitcher';
import { ZoomControls } from './components/ZoomControls';
import { TimeStepper } from './components/TimeStepper';
import { FloatingStatusBox } from './components/FloatingStatusBox';
import { TracingImageControls } from './components/TracingImageControls';
import { ScaleFactorControl } from './components/ScaleFactorControl';

export default function Canvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera2D>({ ...DEFAULT_CAMERA });
  const dirtyRef = useRef(true);
  const rafRef = useRef<number>(0);
  const colorsRef = useRef<ThemeColors | null>(null);
  const cursorScreenRef = useRef({ x: 0, y: 0 });
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // Pan state
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const spaceHeldRef = useRef(false);

  // Rect tool state
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const rectEndRef = useRef<{ x: number; y: number } | null>(null);

  // Store selectors (fine-grained to avoid unnecessary re-renders)
  const toolMode = useCanvasStore(s => s.toolMode);
  const appMode = useCanvasStore(s => s.appMode);
  const gridSize = useCanvasStore(s => s.gridSize);
  const showGrid = useCanvasStore(s => s.showGrid);
  const snapToGridEnabled = useCanvasStore(s => s.snapToGrid);

  // Mark dirty whenever store changes
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(() => { dirtyRef.current = true; });
    return unsub;
  }, []);

  // Mark dirty when simulation results change
  useEffect(() => {
    const unsub = useAppStore.subscribe(() => { dirtyRef.current = true; });
    return unsub;
  }, []);

  // Mark dirty when tool/mode changes
  useEffect(() => { dirtyRef.current = true; }, [toolMode, appMode, gridSize, showGrid]);

  // ── Load background image ──
  useEffect(() => {
    const state = useCanvasStore.getState();
    const story = state.stories.find(s => s.id === state.activeStoryId);
    const url = story?.backgroundImage?.url;
    if (!url) {
      bgImageRef.current = null;
      return;
    }
    if (bgImageRef.current?.src === url) return;
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      dirtyRef.current = true;
    };
    img.src = url;
  });

  // ── DPI-aware canvas sizing ──
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    dirtyRef.current = true;
  }, []);

  // ── Render loop ──
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!dirtyRef.current) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }
    dirtyRef.current = false;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const camera = cameraRef.current;

    // Read theme colors (cached)
    if (!colorsRef.current) colorsRef.current = readThemeColors();
    const colors = colorsRef.current;

    // Clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Get store state snapshot
    const state = useCanvasStore.getState();
    const story = state.stories.find(s => s.id === state.activeStoryId) ?? state.stories[0];
    if (!story) {
      rafRef.current = requestAnimationFrame(render);
      return;
    }
    const geo = story.geometry;

    // 0. Background image (behind everything)
    if (story.backgroundImage?.url) {
      const bgImg = bgImageRef.current;
      if (bgImg && bgImg.src === story.backgroundImage.url && bgImg.complete) {
        drawBackgroundImage(ctx, bgImg, story.backgroundImage.opacity,
          story.backgroundImage.scalePixelsPerMeter,
          story.backgroundImage.offsetX, story.backgroundImage.offsetY,
          camera, cssW, cssH, story.backgroundImage.rotation ?? 0);
      }
    }

    // 1. Dot grid
    if (showGrid) {
      drawDotGrid(ctx, camera, cssW, cssH, gridSize, colors);
    }

    // 2. Zone fills
    drawZones(ctx, geo, story.zoneAssignments, camera, cssW, cssH,
      state.selectedFaceId, state.hoveredFaceId, colors);

    // 3. Walls
    drawWalls(ctx, geo, camera, cssW, cssH,
      state.selectedEdgeId, state.hoveredEdgeId, colors);

    // 4. Vertices
    drawVertices(ctx, geo, camera, cssW, cssH, state.snapVertexId, colors);

    // 5. Placements (doors, windows, etc.)
    drawPlacements(ctx, geo, story.placements, camera, cssW, cssH,
      state.selectedPlacementId, colors);

    // 6. Wall preview (dashed line)
    if (state.wallPreview.active && state.toolMode === 'wall') {
      drawWallPreview(ctx,
        state.wallPreview.startX, state.wallPreview.startY,
        state.wallPreview.endX, state.wallPreview.endY,
        camera, cssW, cssH, colors);
    }

    // 7. Rect preview
    if (rectStartRef.current && rectEndRef.current && state.toolMode === 'rect') {
      drawRectPreview(ctx,
        rectStartRef.current.x, rectStartRef.current.y,
        rectEndRef.current.x, rectEndRef.current.y,
        camera, cssW, cssH, colors);
    }

    // 8. Crosshair (screen space, only in drawing modes)
    if (['wall', 'rect', 'door', 'window'].includes(state.toolMode)) {
      drawCrosshair(ctx, cursorScreenRef.current.x, cursorScreenRef.current.y, colors);
    }

    // 9. Results overlays (only in results mode)
    if (state.appMode === 'results') {
      const appState = useAppStore.getState();
      const result = appState.result;
      const transientResult = appState.transientResult;
      const currentTransientStep = state.currentTransientStep;

      // Transient results overlay (prefer transient if available)
      if (transientResult && transientResult.timeSeries.length > 0) {
        const stepIdx = Math.min(currentTransientStep, transientResult.timeSeries.length - 1);
        const step = transientResult.timeSeries[stepIdx];
        if (step) {
          // Build edge flows from transient massFlows
          const edgeFlows: EdgeFlowResult[] = [];
          const edgeMap = new Map(geo.edges.map(e => [e.id, e]));
          const faceToZone = new Map(story.zoneAssignments.map(z => [z.faceId, z]));
          for (const placement of story.placements) {
            const edge = edgeMap.get(placement.edgeId);
            if (!edge) continue;
            const faceIds = edge.faceIds;
            let fromZoneId = 0, toZoneId = 0;
            if (faceIds.length === 2) {
              fromZoneId = faceToZone.get(faceIds[0])?.zoneId ?? 0;
              toZoneId = faceToZone.get(faceIds[1])?.zoneId ?? 0;
            } else if (faceIds.length === 1) {
              fromZoneId = faceToZone.get(faceIds[0])?.zoneId ?? 0;
            }
            // Find link index matching this zone pair
            const linkIdx = appState.links.findIndex(l =>
              (l.from === fromZoneId && l.to === toZoneId) ||
              (l.from === toZoneId && l.to === fromZoneId)
            );
            if (linkIdx >= 0 && step.airflow.massFlows[linkIdx] !== undefined) {
              const link = appState.links[linkIdx];
              const sign = link.from === fromZoneId ? 1 : -1;
              edgeFlows.push({
                edgeId: placement.edgeId,
                massFlow: step.airflow.massFlows[linkIdx] * sign,
                deltaP: 0,
              });
            }
          }

          // Build zone concentrations from transient data
          const zoneConcs: ZoneConcentrationResult[] = [];
          const zoneIdToFaceId = new Map<number, string>();
          for (const z of story.zoneAssignments) {
            zoneIdToFaceId.set(z.zoneId, z.faceId);
          }
          for (let nodeIdx = 0; nodeIdx < transientResult.nodes.length; nodeIdx++) {
            const node = transientResult.nodes[nodeIdx];
            const faceId = zoneIdToFaceId.get(node.id);
            if (faceId && step.concentrations[nodeIdx]) {
              // Sum all species concentrations for heatmap
              const totalConc = step.concentrations[nodeIdx].reduce((a, b) => a + b, 0);
              zoneConcs.push({
                faceId,
                concentration: totalConc,
                pressure: step.airflow.pressures[nodeIdx] ?? 0,
              });
            }
          }

          if (edgeFlows.length > 0) {
            drawFlowArrows(ctx, geo, edgeFlows, camera, cssW, cssH, colors);
            drawPressureLabels(ctx, geo, edgeFlows, camera, cssW, cssH, colors);
          }
          if (zoneConcs.length > 0) {
            drawConcentrationHeatmap(ctx, geo, zoneConcs, camera, cssW, cssH);
          }
        }
      } else if (result) {
        // Steady-state results overlay (fallback)
        const edgeFlows: EdgeFlowResult[] = [];
        const zoneConcs: ZoneConcentrationResult[] = [];

        // Build zoneId→faceId lookup from zone assignments
        const zoneIdToFaceId = new Map<number, string>();
        const faceToZoneSS = new Map(story.zoneAssignments.map(z => [z.faceId, z]));
        for (const z of story.zoneAssignments) {
          zoneIdToFaceId.set(z.zoneId, z.faceId);
        }

        // Build edge→(fromZoneId, toZoneId) lookup from placements
        const edgeMapSS = new Map(geo.edges.map(e => [e.id, e]));
        for (const placement of story.placements) {
          const edge = edgeMapSS.get(placement.edgeId);
          if (!edge) continue;

          const faceIds = edge.faceIds;
          let fromZoneId = 0, toZoneId = 0;
          if (faceIds.length === 2) {
            fromZoneId = faceToZoneSS.get(faceIds[0])?.zoneId ?? 0;
            toZoneId = faceToZoneSS.get(faceIds[1])?.zoneId ?? 0;
          } else if (faceIds.length === 1) {
            fromZoneId = faceToZoneSS.get(faceIds[0])?.zoneId ?? 0;
            toZoneId = 0;
          }

          // Find matching link result
          const linkResult = result.links.find(l =>
            (l.from === fromZoneId && l.to === toZoneId) ||
            (l.from === toZoneId && l.to === fromZoneId)
          );
          if (linkResult) {
            const sign = linkResult.from === fromZoneId ? 1 : -1;
            edgeFlows.push({
              edgeId: placement.edgeId,
              massFlow: linkResult.massFlow * sign,
              deltaP: 0, // steady-state doesn't expose per-link deltaP directly
            });
          }
        }

        // Map node results to zone concentration data
        for (const nodeRes of result.nodes) {
          const faceId = zoneIdToFaceId.get(nodeRes.id);
          if (faceId) {
            zoneConcs.push({
              faceId,
              concentration: nodeRes.pressure, // use pressure for heatmap in steady-state
              pressure: nodeRes.pressure,
            });
          }
        }

        // Draw overlays
        if (edgeFlows.length > 0) {
          drawFlowArrows(ctx, geo, edgeFlows, camera, cssW, cssH, colors);
          drawPressureLabels(ctx, geo, edgeFlows, camera, cssW, cssH, colors);
        }
        if (zoneConcs.length > 0) {
          drawConcentrationHeatmap(ctx, geo, zoneConcs, camera, cssW, cssH);
        }

        // Wind pressure vectors on exterior walls
        const windSpeed = appState.windSpeed;
        const windDirection = appState.windDirection;
        if (windSpeed > 0.01) {
          const cpData: WallCpData[] = [];
          const vertexMapWind = new Map(geo.vertices.map(v => [v.id, v]));
          for (const edge of geo.edges) {
            if (!edge.isExterior) continue;
            const v1 = vertexMapWind.get(edge.vertexIds[0]);
            const v2 = vertexMapWind.get(edge.vertexIds[1]);
            if (!v1 || !v2) continue;
            const edx = v2.x - v1.x;
            const edy = v2.y - v1.y;
            const azimuth = (Math.atan2(edx, -edy) * 180 / Math.PI + 360) % 360;
            const angleRad = (windDirection - azimuth) * Math.PI / 180;
            const cp = 0.6 * Math.cos(angleRad);
            cpData.push({ edgeId: edge.id, cp, azimuth });
          }
          drawWindPressureVectors(ctx, geo, cpData, windDirection, windSpeed, camera, cssW, cssH, colors);
        }
      }
    }

    // 10. Scaled dimension labels (wall lengths + zone areas)
    const sf = state.scaleFactor;
    if (sf !== 1.0 || state.appMode === 'edit') {
      drawWallDimensions(ctx, geo, sf, camera, cssW, cssH, colors);
      drawZoneAreaLabels(ctx, geo, story.zoneAssignments, sf, camera, cssW, cssH, colors);
    }

    // 11. Calibration overlay
    if (state.calibrationPoints) {
      const [p1, p2] = state.calibrationPoints;
      const validP1 = p1 && !isNaN(p1.x) ? p1 : null;
      const validP2 = p2 && !isNaN(p2.x) ? p2 : null;
      drawCalibrationOverlay(ctx, validP1, validP2, camera, cssW, cssH, colors);
    }

    rafRef.current = requestAnimationFrame(render);
  }, [gridSize, showGrid]);

  // ── Setup / teardown ──
  useEffect(() => {
    resizeCanvas();
    rafRef.current = requestAnimationFrame(render);

    const ro = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) ro.observe(containerRef.current);

    // Re-read theme colors on class change (dark mode toggle)
    const mo = new MutationObserver(() => {
      colorsRef.current = null;
      dirtyRef.current = true;
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      mo.disconnect();
    };
  }, [resizeCanvas, render]);

  // ── Helper: get CSS canvas dimensions ──
  const getCanvasCSS = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { w: 0, h: 0 };
    const dpr = window.devicePixelRatio || 1;
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  };

  // ── Helper: get world coords from mouse event ──
  const mouseToWorld = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { wx: 0, wy: 0 };
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { w, h } = getCanvasCSS();
    return screenToWorld(sx, sy, cameraRef.current, w, h);
  };

  // ── Mouse events ──

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const state = useCanvasStore.getState();
    const { wx, wy } = mouseToWorld(e);
    const story = state.stories.find(s => s.id === state.activeStoryId) ?? state.stories[0];
    if (!story) return;
    const geo = story.geometry;

    // Middle-click or space+click: pan
    if (e.button === 1 || spaceHeldRef.current || state.toolMode === 'pan') {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX, y: e.clientY,
        camX: cameraRef.current.panX, camY: cameraRef.current.panY,
      };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return; // left click only below

    // Tracing image calibration mode: intercept clicks for two-point calibration
    if ((state as any)._tracingCalibrationActive) {
      const addPoint = (window as any).__tracingCalibrationAddPoint;
      if (typeof addPoint === 'function') {
        addPoint(wx, wy);
      }
      dirtyRef.current = true;
      return;
    }

    const snapThreshold = screenDistToWorld(12, cameraRef.current.zoom);

    switch (state.toolMode) {
      case 'select': {
        const hit = hitTest(geo, story.placements, wx, wy, cameraRef.current);
        if (hit.type === 'placement') {
          useCanvasStore.getState().selectPlacement(hit.id);
        } else if (hit.type === 'edge') {
          useCanvasStore.getState().selectEdge(hit.id);
        } else if (hit.type === 'face') {
          useCanvasStore.getState().selectFace(hit.id);
        } else {
          // Click on empty → start pan
          useCanvasStore.getState().clearSelection();
          isPanningRef.current = true;
          panStartRef.current = {
            x: e.clientX, y: e.clientY,
            camX: cameraRef.current.panX, camY: cameraRef.current.panY,
          };
        }
        break;
      }

      case 'wall': {
        if (!state.wallPreview.active) {
          // First click: start wall
          const snapped = snapToGridEnabled ? snapToGrid(wx, gridSize) : wx;
          const snappedY = snapToGridEnabled ? snapToGrid(wy, gridSize) : wy;
          // Check vertex snap
          const sv = findNearestVertex(geo, wx, wy, snapThreshold);
          const sx = sv ? sv.x : snapped;
          const sy = sv ? sv.y : snappedY;
          useCanvasStore.getState().startWallPreview(sx, sy);
          if (sv) useCanvasStore.getState().setSnapVertexId(sv.id);
        } else {
          // Second click: confirm wall
          useCanvasStore.getState().confirmWall();
          useCanvasStore.getState().setSnapVertexId(null);
        }
        break;
      }

      case 'rect': {
        if (!rectStartRef.current) {
          // First click: start rectangle
          const sx = snapToGridEnabled ? snapToGrid(wx, gridSize) : wx;
          const sy = snapToGridEnabled ? snapToGrid(wy, gridSize) : wy;
          rectStartRef.current = { x: sx, y: sy };
          rectEndRef.current = { x: sx, y: sy };
        } else {
          // Second click: confirm rectangle (4 walls)
          const { x: x1, y: y1 } = rectStartRef.current;
          const x2 = snapToGridEnabled ? snapToGrid(wx, gridSize) : wx;
          const y2 = snapToGridEnabled ? snapToGrid(wy, gridSize) : wy;

          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          if (w >= 0.3 && h >= 0.3) {
            const minX = Math.min(x1, x2);
            const minY = Math.min(y1, y2);
            const maxX = Math.max(x1, x2);
            const maxY = Math.max(y1, y2);
            // Add 4 orthogonal walls
            const store = useCanvasStore.getState();
            store.addWall(minX, minY, maxX, minY); // top
            store.addWall(maxX, minY, maxX, maxY); // right
            store.addWall(maxX, maxY, minX, maxY); // bottom
            store.addWall(minX, maxY, minX, minY); // left
          }
          rectStartRef.current = null;
          rectEndRef.current = null;
        }
        break;
      }

      case 'door':
      case 'window': {
        // Place on nearest edge
        const edgeId = hitTest(geo, story.placements, wx, wy, cameraRef.current);
        if (edgeId.type === 'edge' && edgeId.id) {
          const alpha = computeAlphaOnEdge(geo, edgeId.id, wx, wy);
          useCanvasStore.getState().addPlacement(edgeId.id, alpha, state.toolMode);
        }
        break;
      }

      case 'erase': {
        const hit = hitTest(geo, story.placements, wx, wy, cameraRef.current);
        if (hit.type === 'placement' && hit.id) {
          useCanvasStore.getState().removePlacement(hit.id);
        } else if (hit.type === 'edge' && hit.id) {
          useCanvasStore.getState().removeEdge(hit.id);
        }
        break;
      }
    }
    dirtyRef.current = true;
  }, [toolMode, gridSize, snapToGridEnabled]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    cursorScreenRef.current = { x: sx, y: sy };

    // Pan
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      cameraRef.current = {
        ...cameraRef.current,
        panX: panStartRef.current.camX + dx,
        panY: panStartRef.current.camY + dy,
      };
      dirtyRef.current = true;
      return;
    }

    const { w, h } = getCanvasCSS();
    const { wx, wy } = screenToWorld(sx, sy, cameraRef.current, w, h);
    const state = useCanvasStore.getState();
    const story = state.stories.find(s => s.id === state.activeStoryId) ?? state.stories[0];
    if (!story) return;
    const geo = story.geometry;
    const snapThreshold = screenDistToWorld(12, cameraRef.current.zoom);

    // Update cursor position in store
    useCanvasStore.getState().setCursorWorld({ x: wx, y: wy, z: 0 });
    const gx = snapToGridEnabled ? snapToGrid(wx, gridSize) : wx;
    const gy = snapToGridEnabled ? snapToGrid(wy, gridSize) : wy;
    useCanvasStore.getState().setCursorGrid({ x: gx, y: gy });

    // Wall preview update with orthogonal constraint
    if (state.wallPreview.active && state.toolMode === 'wall') {
      const ortho = constrainOrthogonal(
        state.wallPreview.startX, state.wallPreview.startY,
        wx, wy, gridSize, geo, snapThreshold,
      );
      useCanvasStore.getState().updateWallPreview(ortho.x, ortho.y);
      useCanvasStore.getState().setSnapVertexId(ortho.snappedVertexId);
    }

    // Rect preview update
    if (rectStartRef.current && state.toolMode === 'rect') {
      const rx = snapToGridEnabled ? snapToGrid(wx, gridSize) : wx;
      const ry = snapToGridEnabled ? snapToGrid(wy, gridSize) : wy;
      rectEndRef.current = { x: rx, y: ry };
    }

    // Hover detection (select mode)
    if (state.toolMode === 'select') {
      const hit = hitTest(geo, story.placements, wx, wy, cameraRef.current);
      if (hit.type === 'edge') {
        useCanvasStore.getState().setHoveredEdge(hit.id);
        useCanvasStore.getState().setHoveredFace(null);
      } else if (hit.type === 'face') {
        useCanvasStore.getState().setHoveredEdge(null);
        useCanvasStore.getState().setHoveredFace(hit.id);
      } else {
        useCanvasStore.getState().setHoveredEdge(null);
        useCanvasStore.getState().setHoveredFace(null);
      }
    }

    // Vertex snap feedback for wall/rect modes
    if (['wall', 'rect'].includes(state.toolMode) && !state.wallPreview.active) {
      const sv = findNearestVertex(geo, wx, wy, snapThreshold);
      useCanvasStore.getState().setSnapVertexId(sv?.id ?? null);
    }

    dirtyRef.current = true;
  }, [toolMode, gridSize, snapToGridEnabled]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { w, h } = getCanvasCSS();

    cameraRef.current = zoomAtPoint(
      cameraRef.current, sx, sy, w, h,
      e.deltaY < 0 ? 1 : -1,
    );
    dirtyRef.current = true;
  }, []);

  // ── Keyboard events ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = true;
        e.preventDefault();
      }
      if (e.code === 'Escape') {
        const state = useCanvasStore.getState();
        if (state.wallPreview.active) {
          state.cancelWallPreview();
          state.setSnapVertexId(null);
        }
        if (rectStartRef.current) {
          rectStartRef.current = null;
          rectEndRef.current = null;
        }
        state.clearSelection();
        dirtyRef.current = true;
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const state = useCanvasStore.getState();
        if (state.selectedPlacementId) {
          state.removePlacement(state.selectedPlacementId);
        } else if (state.selectedEdgeId) {
          state.removeEdge(state.selectedEdgeId);
        }
      }
      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey) {
        const store = useCanvasStore.getState();
        if (e.code === 'Digit1' || e.code === 'KeyV') store.setToolMode('select');
        if (e.code === 'Digit2' || e.code === 'KeyW') store.setToolMode('wall');
        if (e.code === 'Digit3' || e.code === 'KeyR') store.setToolMode('rect');
        if (e.code === 'Digit4' || e.code === 'KeyD') store.setToolMode('door');
        if (e.code === 'Digit5') store.setToolMode('window');
        if (e.code === 'Digit6' || e.code === 'KeyE') store.setToolMode('erase');
      }
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) {
          useCanvasStore.temporal.getState().redo();
        } else {
          useCanvasStore.temporal.getState().undo();
        }
        dirtyRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── Cursor style ──
  const getCursor = () => {
    if (isPanningRef.current || spaceHeldRef.current) return 'grabbing';
    switch (toolMode) {
      case 'pan': return 'grab';
      case 'wall': case 'rect': return 'crosshair';
      case 'door': case 'window': return 'copy';
      case 'erase': return 'not-allowed';
      default: return 'default';
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* HTML overlay components */}
      <ZoomControls />
      <FloorSwitcher />
      <TimeStepper />
      <FloatingStatusBox />
      <TracingImageControls />
      <ScaleFactorControl />
      <CanvasContextMenu />
    </div>
  );
}
