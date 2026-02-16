import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Story, EdgePlacement, ZoneAssignment, Geometry } from '../model/geometry';
import {
  createDefaultStory, createEmptyGeometry, generateId,
  addWall as geoAddWall, removeEdge as geoRemoveEdge,
  rebuildFaces, faceArea, getEdge,
} from '../model/geometry';

// ── Tool mode ──
export type ToolMode = 'select' | 'wall' | 'rect' | 'door' | 'window' | 'erase' | 'pan';

// H-10: All placeable element types
export type PlacementToolType = EdgePlacement['type'];

// ── App mode (edit vs results) ──
export type AppMode = 'edit' | 'results';

// ── Selection state ──
export interface SelectionState {
  selectedEdgeId: string | null;
  selectedFaceId: string | null;
  selectedPlacementId: string | null;
  selectedVertexId: string | null;
}

// ── Hover state ──
export interface HoverState {
  hoveredEdgeId: string | null;
  hoveredFaceId: string | null;
  hoveredPlacementId: string | null;
  cursorWorld: { x: number; y: number; z?: number } | null;
  cursorGrid: { x: number; y: number } | null;
}

// ── Wall drawing preview ──
export interface WallPreview {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  active: boolean;
}

// ── Canvas Store ──
export interface CanvasState extends SelectionState, HoverState {
  // Mode
  appMode: AppMode;
  toolMode: ToolMode;
  activePlacementType: PlacementToolType; // H-10: which element type to place

  // Building data
  stories: Story[];
  activeStoryId: string;

  // Grid settings
  gridSize: number;        // meters per grid cell
  snapToGrid: boolean;
  showGrid: boolean;

  // Scale factor (pseudo-geometry)
  scaleFactor: number;     // meters per grid unit (default 1.0 = 1:1)
  calibrationPoints: [{ x: number; y: number }, { x: number; y: number }] | null;

  // Wall drawing
  wallPreview: WallPreview;

  // Camera (2D)
  cameraZoom: number;
  zoomToFitCounter: number;

  // Sidebar
  sidebarOpen: boolean;
  sidebarTab: string;

  // Snap feedback
  snapVertexId: string | null;  // currently snapped vertex for visual feedback

  // Transient playback
  currentTransientStep: number;

  // Actions - Mode
  setAppMode: (mode: AppMode) => void;
  setToolMode: (mode: ToolMode) => void;
  setActivePlacementType: (type: PlacementToolType) => void;

  // Actions - Selection
  selectEdge: (id: string | null) => void;
  selectFace: (id: string | null) => void;
  selectPlacement: (id: string | null) => void;
  clearSelection: () => void;

  // Actions - Hover
  setHoveredEdge: (id: string | null) => void;
  setHoveredFace: (id: string | null) => void;
  setHoveredPlacement: (id: string | null) => void;
  setCursorWorld: (pos: { x: number; y: number; z?: number } | null) => void;
  setCursorGrid: (pos: { x: number; y: number } | null) => void;

  // Actions - Wall drawing
  startWallPreview: (x: number, y: number) => void;
  updateWallPreview: (x: number, y: number) => void;
  cancelWallPreview: () => void;
  confirmWall: () => void;

  // Actions - Building
  addWall: (x1: number, y1: number, x2: number, y2: number) => void;
  addRect: (x1: number, y1: number, x2: number, y2: number) => void;
  removeEdge: (edgeId: string) => void;
  removeEdges: (edgeIds: string[]) => void;
  updateEdge: (edgeId: string, updates: Partial<Pick<import('../model/geometry').GeoEdge, 'wallHeight' | 'wallThickness' | 'isExterior'>>) => void;
  getActiveGeometry: () => Geometry;
  getActiveStory: () => Story;

  // Actions - Story management
  addStory: () => void;
  setActiveStory: (id: string) => void;
  updateStoryHeight: (id: string, height: number) => void;
  removeStory: (storyId: string) => void;
  renameStory: (storyId: string, name: string) => void;
  duplicateStory: (storyId: string) => void;

  // Actions - Zone assignment
  assignZone: (faceId: string, name: string, temperature?: number) => void;
  updateZone: (faceId: string, updates: Partial<ZoneAssignment>) => void;
  getZoneForFace: (faceId: string) => ZoneAssignment | undefined;

  // Actions - Placement (doors, windows on edges)
  addPlacement: (edgeId: string, alpha: number, type: EdgePlacement['type']) => void;
  removePlacement: (id: string) => void;
  updatePlacement: (id: string, updates: Partial<EdgePlacement>) => void;

  // Actions - Grid
  setGridSize: (size: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setShowGrid: (show: boolean) => void;

  // Actions - Scale factor
  setScaleFactor: (factor: number) => void;
  setCalibrationPoints: (points: [{ x: number; y: number }, { x: number; y: number }] | null) => void;
  applyCalibration: (realWorldDistance: number) => void;

  // Actions - Camera
  setCameraZoom: (zoom: number) => void;
  requestZoomToFit: () => void;

  // Actions - Sidebar
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: string) => void;

  // Actions - Display
  setSnapVertexId: (id: string | null) => void;

  // Actions - Transient playback
  setCurrentTransientStep: (step: number) => void;

  // Actions - Background image
  setBackgroundImage: (storyId: string, image: { url: string; opacity: number; scalePixelsPerMeter: number; offsetX: number; offsetY: number; rotation: 0 | 90 | 180 | 270; locked: boolean } | undefined) => void;
  updateBackgroundImage: (storyId: string, updates: Partial<NonNullable<Story['backgroundImage']>>) => void;

  // Actions - Serialization
  clearAll: () => void;
}

/** Derive next zone ID from current stories (always consistent, survives HMR) */
function getNextZoneId(stories: import('../model/geometry').Story[]): number {
  let maxId = 99;
  for (const s of stories) {
    for (const z of s.zoneAssignments) {
      if (z.zoneId > maxId) maxId = z.zoneId;
    }
  }
  return maxId + 1;
}

// ── Zone color palette ──
const ZONE_COLORS = [
  '#93c5fd', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd',
  '#67e8f9', '#fdba74', '#f9a8d4', '#a5b4fc', '#6ee7b7',
];

/** L-29: Extracted helper — auto-assign zones for new faces, prune stale assignments */
function autoAssignZones(
  geo: Geometry,
  story: Story,
  stories: Story[],
): ZoneAssignment[] {
  const existingFaceIds = new Set(story.zoneAssignments.map(z => z.faceId));
  const newAssignments = [...story.zoneAssignments];
  let nextId = getNextZoneId(stories);
  for (const face of geo.faces) {
    if (!existingFaceIds.has(face.id)) {
      const area = faceArea(geo, face);
      newAssignments.push({
        faceId: face.id,
        zoneId: nextId++,
        name: '', // placeholder, will be renumbered below
        temperature: 293.15,
        volume: area * story.floorToCeilingHeight,
        color: ZONE_COLORS[newAssignments.length % ZONE_COLORS.length],
      });
    }
  }
  const validFaceIds = new Set(geo.faces.map(f => f.id));
  const filtered = newAssignments.filter(z => validFaceIds.has(z.faceId));
  // Renumber room names sequentially
  filtered.forEach((z, i) => {
    z.name = `房间 ${i + 1}`;
  });
  return filtered;
}

export const useCanvasStore = create<CanvasState>()(temporal((set, get) => {
  const initialStory = createDefaultStory(0);
  return {
  // Mode
  appMode: 'edit',
  toolMode: 'select',
  activePlacementType: 'door' as PlacementToolType,

  // Building data
  stories: [initialStory],
  activeStoryId: initialStory.id,

  // Selection
  selectedEdgeId: null,
  selectedFaceId: null,
  selectedPlacementId: null,
  selectedVertexId: null,

  // Hover
  hoveredEdgeId: null,
  hoveredFaceId: null,
  hoveredPlacementId: null,
  cursorWorld: null,
  cursorGrid: null,

  // Grid
  gridSize: 0.1,
  snapToGrid: true,
  showGrid: true,

  // Scale factor
  scaleFactor: 1.0,
  calibrationPoints: null,

  // Wall preview
  wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },

  // Camera (2D)
  cameraZoom: 50,
  zoomToFitCounter: 0,

  // Sidebar
  sidebarOpen: false,
  sidebarTab: 'model',

  // Display
  snapVertexId: null,

  // Transient playback
  currentTransientStep: 0,

  // ── Mode actions ──
  setAppMode: (mode) => set({ appMode: mode }),
  setToolMode: (mode) => set({
    toolMode: mode,
    wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },
  }),
  setActivePlacementType: (type) => set({ activePlacementType: type }),

  // ── Selection actions ──
  selectEdge: (id) => set({
    selectedEdgeId: id,
    selectedFaceId: null,
    selectedPlacementId: null,
    selectedVertexId: null,
    ...(id ? { sidebarOpen: true } : {}),
  }),
  selectFace: (id) => set({
    selectedEdgeId: null,
    selectedFaceId: id,
    selectedPlacementId: null,
    selectedVertexId: null,
    ...(id ? { sidebarOpen: true } : {}),
  }),
  selectPlacement: (id) => set({
    selectedEdgeId: null,
    selectedFaceId: null,
    selectedPlacementId: id,
    selectedVertexId: null,
    ...(id ? { sidebarOpen: true } : {}),
  }),
  clearSelection: () => set({
    selectedEdgeId: null,
    selectedFaceId: null,
    selectedPlacementId: null,
    selectedVertexId: null,
  }),

  // ── Hover actions ──
  setHoveredEdge: (id) => set({ hoveredEdgeId: id }),
  setHoveredFace: (id) => set({ hoveredFaceId: id }),
  setHoveredPlacement: (id) => set({ hoveredPlacementId: id }),
  setCursorWorld: (pos) => set({ cursorWorld: pos }),
  setCursorGrid: (pos) => set({ cursorGrid: pos }),

  // ── Wall drawing ──
  startWallPreview: (x, y) => set({
    wallPreview: { startX: x, startY: y, endX: x, endY: y, active: true },
  }),
  updateWallPreview: (x, y) => set((state) => ({
    wallPreview: { ...state.wallPreview, endX: x, endY: y },
  })),
  cancelWallPreview: () => set({
    wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },
  }),
  confirmWall: () => {
    const state = get();
    const wp = state.wallPreview;
    if (!wp.active) return;

    // Minimum length check to avoid zero-length walls
    const dx = wp.endX - wp.startX;
    const dy = wp.endY - wp.startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.1) return;

    // Combined: add wall + set next chain start point
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return;

    const story = { ...stories[storyIdx] };
    const geo = structuredClone(story.geometry);

    geoAddWall(geo, wp.startX, wp.startY, wp.endX, wp.endY, story.floorToCeilingHeight);
    rebuildFaces(geo);

    story.geometry = geo;
    story.zoneAssignments = autoAssignZones(geo, story, stories);
    stories[storyIdx] = story;

    set({
      stories,
      // BUG-2: Do not chain — each wall is drawn independently
      wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },
    });
  },

  // ── Building actions ──
  addWall: (x1, y1, x2, y2) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const geo = structuredClone(story.geometry);

    geoAddWall(geo, x1, y1, x2, y2, story.floorToCeilingHeight);
    rebuildFaces(geo);

    story.geometry = geo;
    story.zoneAssignments = autoAssignZones(geo, story, stories);
    stories[storyIdx] = story;

    return { stories };
  }),

  // Atomic rect: 4 walls in one undo step
  addRect: (x1, y1, x2, y2) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const geo = structuredClone(story.geometry);
    const h = story.floorToCeilingHeight;

    const minX = Math.min(x1, x2), minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2), maxY = Math.max(y1, y2);
    geoAddWall(geo, minX, minY, maxX, minY, h);
    geoAddWall(geo, maxX, minY, maxX, maxY, h);
    geoAddWall(geo, maxX, maxY, minX, maxY, h);
    geoAddWall(geo, minX, maxY, minX, minY, h);
    rebuildFaces(geo);

    story.geometry = geo;
    story.zoneAssignments = autoAssignZones(geo, story, stories);
    stories[storyIdx] = story;
    return { stories };
  }),

  removeEdge: (edgeId) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const geo = structuredClone(story.geometry);

    geoRemoveEdge(geo, edgeId);
    rebuildFaces(geo);

    // Remove placements on deleted edge
    story.placements = story.placements.filter(p => p.edgeId !== edgeId);

    // BUG-3: Use autoAssignZones to properly handle merged faces
    story.geometry = geo;
    story.zoneAssignments = autoAssignZones(geo, story, stories);
    stories[storyIdx] = story;

    return {
      stories,
      selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
    };
  }),

  // Batch remove edges (single undo step, single rebuildFaces)
  removeEdges: (edgeIds) => set((state) => {
    if (edgeIds.length === 0) return {};
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const geo = structuredClone(story.geometry);
    const idSet = new Set(edgeIds);

    // Remove all edges at once, then rebuild faces once
    for (const edgeId of edgeIds) {
      geoRemoveEdge(geo, edgeId);
    }
    rebuildFaces(geo);

    // Remove placements on any deleted edge
    story.placements = story.placements.filter(p => !idSet.has(p.edgeId));

    story.geometry = geo;
    story.zoneAssignments = autoAssignZones(geo, story, stories);
    stories[storyIdx] = story;

    return {
      stories,
      selectedEdgeId: state.selectedEdgeId && idSet.has(state.selectedEdgeId) ? null : state.selectedEdgeId,
    };
  }),

  // M-02: Update edge properties
  updateEdge: (edgeId, updates) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const geo = structuredClone(story.geometry);
    const edge = geo.edges.find(e => e.id === edgeId);
    if (!edge) return {};

    Object.assign(edge, updates);
    story.geometry = geo;
    stories[storyIdx] = story;
    return { stories };
  }),

  getActiveGeometry: () => {
    const state = get();
    const story = state.stories.find(s => s.id === state.activeStoryId);
    return story?.geometry ?? createEmptyGeometry();
  },

  getActiveStory: () => {
    const state = get();
    return state.stories.find(s => s.id === state.activeStoryId) ?? state.stories[0];
  },

  // ── Story management ──
  addStory: () => set((state) => {
    const maxLevel = state.stories.reduce((max, s) => Math.max(max, s.level), -1);
    const newStory = createDefaultStory(maxLevel + 1);
    return {
      stories: [...state.stories, newStory],
      activeStoryId: newStory.id,
    };
  }),
  setActiveStory: (id) => set({ activeStoryId: id, selectedEdgeId: null, selectedFaceId: null, selectedPlacementId: null }),
  updateStoryHeight: (id, height) => set((state) => ({
    stories: state.stories.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, floorToCeilingHeight: height };
      // L-18: Recalculate zone volumes when height changes
      updated.zoneAssignments = updated.zoneAssignments.map(z => {
        const face = updated.geometry.faces.find(f => f.id === z.faceId);
        if (!face) return z;
        const area = faceArea(updated.geometry, face);
        return { ...z, volume: area * height };
      });
      return updated;
    }),
  })),

  // H-06: Story CRUD
  removeStory: (storyId) => set((state) => {
    if (state.stories.length <= 1) return {}; // keep at least one story
    const filtered = state.stories.filter(s => s.id !== storyId);
    // Re-index levels sequentially after deletion
    const reindexed = filtered
      .sort((a, b) => a.level - b.level)
      .map((s, i) => ({ ...s, level: i, name: `${i === 0 ? '首层' : `${i + 1}层`}` }));
    const newActive = state.activeStoryId === storyId ? reindexed[0].id : state.activeStoryId;
    return { stories: reindexed, activeStoryId: newActive, selectedEdgeId: null, selectedFaceId: null, selectedPlacementId: null };
  }),
  renameStory: (storyId, name) => set((state) => ({
    stories: state.stories.map(s => s.id === storyId ? { ...s, name } : s),
  })),
  duplicateStory: (storyId) => set((state) => {
    const source = state.stories.find(s => s.id === storyId);
    if (!source) return {};
    const maxLevel = state.stories.reduce((max, s) => Math.max(max, s.level), -1);
    const newId = generateId('story_');
    let nextZoneId = getNextZoneId(state.stories);
    const newStory: Story = {
      ...structuredClone(source),
      id: newId,
      name: `${source.name} (副本)`,
      level: maxLevel + 1,
    };
    // Reassign zone IDs to avoid collisions
    for (const z of newStory.zoneAssignments) {
      z.zoneId = nextZoneId++;
    }
    // Regenerate placement IDs
    for (const p of newStory.placements) {
      p.id = generateId('p_');
    }
    return { stories: [...state.stories, newStory], activeStoryId: newId };
  }),

  // ── Zone assignment ──
  assignZone: (faceId, name, temperature = 293.15) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const geo = story.geometry;
    const face = geo.faces.find(f => f.id === faceId);
    if (!face) return {};

    const area = faceArea(geo, face);
    const existing = story.zoneAssignments.findIndex(z => z.faceId === faceId);
    if (existing >= 0) {
      story.zoneAssignments[existing] = {
        ...story.zoneAssignments[existing],
        name,
        temperature,
      };
    } else {
      story.zoneAssignments.push({
        faceId,
        zoneId: getNextZoneId(stories),
        name,
        temperature,
        volume: area * story.floorToCeilingHeight,
        color: ZONE_COLORS[story.zoneAssignments.length % ZONE_COLORS.length],
      });
    }
    stories[storyIdx] = story;
    return { stories };
  }),
  updateZone: (faceId, updates) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    story.zoneAssignments = story.zoneAssignments.map(z =>
      z.faceId === faceId ? { ...z, ...updates } : z
    );
    stories[storyIdx] = story;
    return { stories };
  }),
  getZoneForFace: (faceId) => {
    const state = get();
    const story = state.stories.find(s => s.id === state.activeStoryId);
    return story?.zoneAssignments.find(z => z.faceId === faceId);
  },

  // ── Placement ──
  addPlacement: (edgeId, alpha, type) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    const edge = getEdge(story.geometry, edgeId);
    if (!edge) return {};

    // L-13: Reject duplicate placement at same position on same edge
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const duplicate = story.placements.find(
      p => p.edgeId === edgeId && Math.abs(p.alpha - clampedAlpha) < 0.02
    );
    if (duplicate) return {};

    const placement: EdgePlacement = {
      id: generateId('p_'),
      edgeId,
      alpha: clampedAlpha,
      type,
      isConfigured: false,
    };
    story.placements = [...story.placements, placement];
    stories[storyIdx] = story;
    return { stories, selectedPlacementId: placement.id };
  }),
  removePlacement: (id) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    story.placements = story.placements.filter(p => p.id !== id);
    stories[storyIdx] = story;
    return {
      stories,
      selectedPlacementId: state.selectedPlacementId === id ? null : state.selectedPlacementId,
    };
  }),
  updatePlacement: (id, updates) => set((state) => {
    const stories = [...state.stories];
    const storyIdx = stories.findIndex(s => s.id === state.activeStoryId);
    if (storyIdx === -1) return {};

    const story = { ...stories[storyIdx] };
    story.placements = story.placements.map(p =>
      p.id === id ? { ...p, ...updates } : p
    );
    stories[storyIdx] = story;
    return { stories };
  }),

  // ── Grid ──
  setGridSize: (size) => set({ gridSize: size }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),
  setShowGrid: (show) => set({ showGrid: show }),

  // ── Scale factor ──
  setScaleFactor: (factor) => set({ scaleFactor: Math.max(0.001, factor) }),
  setCalibrationPoints: (points) => set({ calibrationPoints: points }),
  applyCalibration: (realWorldDistance) => {
    const state = get();
    const pts = state.calibrationPoints;
    if (!pts) return;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const gridDist = Math.sqrt(dx * dx + dy * dy);
    if (gridDist < 1e-6) return;
    const factor = realWorldDistance / gridDist;
    set({ scaleFactor: Math.max(0.001, factor), calibrationPoints: null });
  },

  // ── Camera ──
  setCameraZoom: (zoom) => set({ cameraZoom: zoom }),
  requestZoomToFit: () => set((state) => ({ zoomToFitCounter: state.zoomToFitCounter + 1 })),

  // ── Sidebar ──
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // ── Display ──
  setSnapVertexId: (id) => set({ snapVertexId: id }),

  // ── Transient playback ──
  setCurrentTransientStep: (step) => set({ currentTransientStep: step }),

  // ── Background image ──
  setBackgroundImage: (storyId, image) => set((state) => ({
    stories: state.stories.map(s =>
      s.id === storyId ? { ...s, backgroundImage: image } : s
    ),
  })),
  updateBackgroundImage: (storyId, updates) => set((state) => ({
    stories: state.stories.map(s => {
      if (s.id !== storyId || !s.backgroundImage) return s;
      return { ...s, backgroundImage: { ...s.backgroundImage, ...updates } };
    }),
  })),

  // ── Clear ──
  clearAll: () => {
    const freshStory = createDefaultStory(0);
    set({
      stories: [freshStory],
      activeStoryId: freshStory.id,
      selectedEdgeId: null,
      selectedFaceId: null,
      selectedPlacementId: null,
      selectedVertexId: null,
      wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },
      toolMode: 'select',
      appMode: 'edit',
      scaleFactor: 1.0,
      calibrationPoints: null,
    });
  },
  };
}, { limit: 100 }));

// activeStoryId is now initialized inline — no post-init patch needed
