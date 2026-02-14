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

  // Building data
  stories: Story[];
  activeStoryId: string;

  // Grid settings
  gridSize: number;        // meters per grid cell
  snapToGrid: boolean;
  showGrid: boolean;

  // Wall drawing
  wallPreview: WallPreview;

  // Camera (2D)
  cameraZoom: number;

  // Sidebar
  sidebarOpen: boolean;
  sidebarTab: string;

  // Snap feedback
  snapVertexId: string | null;  // currently snapped vertex for visual feedback

  // Actions - Mode
  setAppMode: (mode: AppMode) => void;
  setToolMode: (mode: ToolMode) => void;

  // Actions - Selection
  selectEdge: (id: string | null) => void;
  selectFace: (id: string | null) => void;
  selectPlacement: (id: string | null) => void;
  clearSelection: () => void;

  // Actions - Hover
  setHoveredEdge: (id: string | null) => void;
  setHoveredFace: (id: string | null) => void;
  setCursorWorld: (pos: { x: number; y: number; z?: number } | null) => void;
  setCursorGrid: (pos: { x: number; y: number } | null) => void;

  // Actions - Wall drawing
  startWallPreview: (x: number, y: number) => void;
  updateWallPreview: (x: number, y: number) => void;
  cancelWallPreview: () => void;
  confirmWall: () => void;

  // Actions - Building
  addWall: (x1: number, y1: number, x2: number, y2: number) => void;
  removeEdge: (edgeId: string) => void;
  getActiveGeometry: () => Geometry;
  getActiveStory: () => Story;

  // Actions - Story management
  addStory: () => void;
  setActiveStory: (id: string) => void;
  updateStoryHeight: (id: string, height: number) => void;

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

  // Actions - Camera
  setCameraZoom: (zoom: number) => void;

  // Actions - Sidebar
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: string) => void;

  // Actions - Display
  setSnapVertexId: (id: string | null) => void;

  // Actions - Background image
  setBackgroundImage: (storyId: string, image: { url: string; opacity: number; scalePixelsPerMeter: number; offsetX: number; offsetY: number } | undefined) => void;

  // Actions - Serialization
  clearAll: () => void;
}

let _nextZoneId = 100;

/** Sync _nextZoneId to be above all existing zone IDs across all stories */
function syncNextZoneId(stories: import('../model/geometry').Story[]) {
  let maxId = 99;
  for (const s of stories) {
    for (const z of s.zoneAssignments) {
      if (z.zoneId > maxId) maxId = z.zoneId;
    }
  }
  _nextZoneId = maxId + 1;
}

export const useCanvasStore = create<CanvasState>()(temporal((set, get) => ({
  // Mode
  appMode: 'edit',
  toolMode: 'select',

  // Building data
  stories: [createDefaultStory(0)],
  activeStoryId: '',

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

  // Wall preview
  wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },

  // Camera (2D)
  cameraZoom: 50,

  // Sidebar
  sidebarOpen: false,
  sidebarTab: 'model',

  // Display
  snapVertexId: null,

  // ── Mode actions ──
  setAppMode: (mode) => set({ appMode: mode }),
  setToolMode: (mode) => set({
    toolMode: mode,
    wallPreview: { startX: 0, startY: 0, endX: 0, endY: 0, active: false },
  }),

  // ── Selection actions ──
  selectEdge: (id) => set({
    selectedEdgeId: id,
    selectedFaceId: null,
    selectedPlacementId: null,
    selectedVertexId: null,
  }),
  selectFace: (id) => set({
    selectedEdgeId: null,
    selectedFaceId: id,
    selectedPlacementId: null,
    selectedVertexId: null,
  }),
  selectPlacement: (id) => set({
    selectedEdgeId: null,
    selectedFaceId: null,
    selectedPlacementId: id,
    selectedVertexId: null,
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

    // Auto-assign zones for new faces
    const existingFaceIds = new Set(story.zoneAssignments.map(z => z.faceId));
    const newAssignments = [...story.zoneAssignments];
    for (const face of geo.faces) {
      if (!existingFaceIds.has(face.id)) {
        const area = faceArea(geo, face);
        newAssignments.push({
          faceId: face.id,
          zoneId: _nextZoneId++,
          name: `房间 ${newAssignments.length + 1}`,
          temperature: 293.15,
          volume: area * story.floorToCeilingHeight,
          color: ZONE_COLORS[newAssignments.length % ZONE_COLORS.length],
        });
      }
    }
    const validFaceIds = new Set(geo.faces.map(f => f.id));
    story.geometry = geo;
    story.zoneAssignments = newAssignments.filter(z => validFaceIds.has(z.faceId));
    stories[storyIdx] = story;
    syncNextZoneId(stories);

    set({
      stories,
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

    // Auto-assign zones for new faces
    const existingFaceIds = new Set(story.zoneAssignments.map(z => z.faceId));
    const newAssignments = [...story.zoneAssignments];
    for (const face of geo.faces) {
      if (!existingFaceIds.has(face.id)) {
        const area = faceArea(geo, face);
        newAssignments.push({
          faceId: face.id,
          zoneId: _nextZoneId++,
          name: `房间 ${newAssignments.length + 1}`,
          temperature: 293.15,
          volume: area * story.floorToCeilingHeight,
          color: ZONE_COLORS[newAssignments.length % ZONE_COLORS.length],
        });
      }
    }
    // Remove assignments for faces that no longer exist
    const validFaceIds = new Set(geo.faces.map(f => f.id));
    const filteredAssignments = newAssignments.filter(z => validFaceIds.has(z.faceId));

    story.geometry = geo;
    story.zoneAssignments = filteredAssignments;
    stories[storyIdx] = story;
    syncNextZoneId(stories);

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

    // Clean up zone assignments
    const validFaceIds = new Set(geo.faces.map(f => f.id));
    story.zoneAssignments = story.zoneAssignments.filter(z => validFaceIds.has(z.faceId));

    story.geometry = geo;
    stories[storyIdx] = story;

    return {
      stories,
      selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
    };
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
    stories: state.stories.map(s => s.id === id ? { ...s, floorToCeilingHeight: height } : s),
  })),

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
        zoneId: _nextZoneId++,
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

    const placement: EdgePlacement = {
      id: generateId('p_'),
      edgeId,
      alpha: Math.max(0, Math.min(1, alpha)),
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

  // ── Camera ──
  setCameraZoom: (zoom) => set({ cameraZoom: zoom }),

  // ── Sidebar ──
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // ── Display ──
  setSnapVertexId: (id) => set({ snapVertexId: id }),

  // ── Background image ──
  setBackgroundImage: (storyId, image) => set((state) => ({
    stories: state.stories.map(s =>
      s.id === storyId ? { ...s, backgroundImage: image } : s
    ),
  })),

  // ── Clear ──
  clearAll: () => {
    _nextZoneId = 100;
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
    });
  },
}), { limit: 100 }));

// Initialize activeStoryId
const initialStories = useCanvasStore.getState().stories;
if (initialStories.length > 0 && !useCanvasStore.getState().activeStoryId) {
  useCanvasStore.setState({ activeStoryId: initialStories[0].id });
}

// ── Zone color palette ──
const ZONE_COLORS = [
  '#93c5fd', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd',
  '#67e8f9', '#fdba74', '#f9a8d4', '#a5b4fc', '#6ee7b7',
];
