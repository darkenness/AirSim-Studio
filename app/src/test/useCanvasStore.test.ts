import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from '../store/useCanvasStore';
import type { ToolMode, AppMode } from '../store/useCanvasStore';

beforeEach(() => {
  useCanvasStore.getState().clearAll();
});

const s = () => useCanvasStore.getState();

describe('useCanvasStore', () => {
  // ── Tool mode switching ──
  describe('tool mode switching', () => {
    it('defaults to select mode', () => {
      expect(s().toolMode).toBe('select');
    });

    it('switches tool mode', () => {
      s().setToolMode('wall');
      expect(s().toolMode).toBe('wall');
    });

    it('cancels wall preview when switching tool', () => {
      s().startWallPreview(1, 2);
      expect(s().wallPreview.active).toBe(true);
      s().setToolMode('select');
      expect(s().wallPreview.active).toBe(false);
    });

    it('cycles through all tool modes', () => {
      const modes: ToolMode[] = ['select', 'wall', 'rect', 'door', 'window', 'erase', 'pan'];
      for (const mode of modes) {
        s().setToolMode(mode);
        expect(s().toolMode).toBe(mode);
      }
    });
  });

  // ── App mode ──
  describe('app mode', () => {
    it('defaults to edit mode', () => {
      expect(s().appMode).toBe('edit');
    });

    it('switches to results mode', () => {
      s().setAppMode('results');
      expect(s().appMode).toBe('results');
    });

    it('switches back to edit mode', () => {
      s().setAppMode('results');
      s().setAppMode('edit');
      expect(s().appMode).toBe('edit');
    });
  });

  // ── Wall creation workflow ──
  describe('wall creation workflow', () => {
    it('startWallPreview sets active and start position', () => {
      s().startWallPreview(3, 4);
      const wp = s().wallPreview;
      expect(wp.active).toBe(true);
      expect(wp.startX).toBe(3);
      expect(wp.startY).toBe(4);
      expect(wp.endX).toBe(3);
      expect(wp.endY).toBe(4);
    });

    it('updateWallPreview updates end position', () => {
      s().startWallPreview(0, 0);
      s().updateWallPreview(5, 3);
      const wp = s().wallPreview;
      expect(wp.endX).toBe(5);
      expect(wp.endY).toBe(3);
      expect(wp.startX).toBe(0);
      expect(wp.startY).toBe(0);
    });

    it('cancelWallPreview resets preview', () => {
      s().startWallPreview(1, 2);
      s().updateWallPreview(5, 6);
      s().cancelWallPreview();
      const wp = s().wallPreview;
      expect(wp.active).toBe(false);
      expect(wp.startX).toBe(0);
      expect(wp.endX).toBe(0);
    });

    it('confirmWall adds wall to geometry and resets preview', () => {
      s().startWallPreview(0, 0);
      s().updateWallPreview(5, 0);
      s().confirmWall();

      const wp = s().wallPreview;
      expect(wp.active).toBe(false);

      const geo = s().getActiveGeometry();
      expect(geo.edges.length).toBeGreaterThanOrEqual(1);
      expect(geo.vertices.length).toBeGreaterThanOrEqual(2);
    });

    it('confirmWall ignores too-short walls (< 0.1m)', () => {
      s().startWallPreview(0, 0);
      s().updateWallPreview(0.05, 0);
      s().confirmWall();

      const geo = s().getActiveGeometry();
      expect(geo.edges).toHaveLength(0);
    });

    it('confirmWall is no-op when preview not active', () => {
      s().confirmWall();
      const geo = s().getActiveGeometry();
      expect(geo.edges).toHaveLength(0);
    });

    it('confirmWall auto-assigns zones for new faces', () => {
      // Build a complete rectangle via confirmWall
      s().startWallPreview(0, 0);
      s().updateWallPreview(5, 0);
      s().confirmWall();

      s().startWallPreview(5, 0);
      s().updateWallPreview(5, 4);
      s().confirmWall();

      s().startWallPreview(5, 4);
      s().updateWallPreview(0, 4);
      s().confirmWall();

      s().startWallPreview(0, 4);
      s().updateWallPreview(0, 0);
      s().confirmWall();

      const story = s().getActiveStory();
      const geo = story.geometry;
      expect(geo.faces.length).toBeGreaterThanOrEqual(1);
      expect(story.zoneAssignments.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── addWall direct ──
  describe('addWall', () => {
    it('adds wall to active story geometry', () => {
      s().addWall(0, 0, 5, 0);
      const geo = s().getActiveGeometry();
      expect(geo.edges).toHaveLength(1);
      expect(geo.vertices).toHaveLength(2);
    });

    it('auto-assigns zones when faces are created', () => {
      s().addWall(0, 0, 5, 0);
      s().addWall(5, 0, 5, 4);
      s().addWall(5, 4, 0, 4);
      s().addWall(0, 4, 0, 0);

      const story = s().getActiveStory();
      expect(story.geometry.faces.length).toBeGreaterThanOrEqual(1);
      expect(story.zoneAssignments.length).toBeGreaterThanOrEqual(1);
      expect(story.zoneAssignments[0].name).toMatch(/房间/);
    });
  });

  // ── removeEdge ──
  describe('removeEdge', () => {
    it('removes edge and cleans up placements', () => {
      s().addWall(0, 0, 5, 0);
      s().addWall(5, 0, 5, 4);
      s().addWall(5, 4, 0, 4);
      s().addWall(0, 4, 0, 0);

      const story = s().getActiveStory();
      const edge = story.geometry.edges[0];
      s().addPlacement(edge.id, 0.5, 'door');
      expect(s().getActiveStory().placements).toHaveLength(1);

      s().removeEdge(edge.id);
      expect(s().getActiveStory().placements).toHaveLength(0);
    });

    it('clears selection if removed edge was selected', () => {
      s().addWall(0, 0, 5, 0);
      const edge = s().getActiveGeometry().edges[0];
      s().selectEdge(edge.id);
      expect(s().selectedEdgeId).toBe(edge.id);

      s().removeEdge(edge.id);
      expect(s().selectedEdgeId).toBeNull();
    });
  });

  // ── Story management ──
  describe('story management', () => {
    it('starts with one story', () => {
      expect(s().stories).toHaveLength(1);
      expect(s().stories[0].level).toBe(0);
    });

    it('addStory creates a new story at next level', () => {
      s().addStory();
      expect(s().stories).toHaveLength(2);
      expect(s().stories[1].level).toBe(1);
    });

    it('addStory switches active story to the new one', () => {
      const oldId = s().activeStoryId;
      s().addStory();
      expect(s().activeStoryId).not.toBe(oldId);
      expect(s().activeStoryId).toBe(s().stories[1].id);
    });

    it('setActiveStory switches and clears selection', () => {
      s().addStory();
      const firstId = s().stories[0].id;
      s().selectEdge('some-edge');
      s().setActiveStory(firstId);
      expect(s().activeStoryId).toBe(firstId);
      expect(s().selectedEdgeId).toBeNull();
    });

    it('updateStoryHeight changes floor-to-ceiling height', () => {
      const storyId = s().stories[0].id;
      s().updateStoryHeight(storyId, 4.5);
      expect(s().stories[0].floorToCeilingHeight).toBe(4.5);
    });

    it('addStory increments level correctly with multiple stories', () => {
      s().addStory();
      s().addStory();
      expect(s().stories).toHaveLength(3);
      expect(s().stories[2].level).toBe(2);
    });
  });

  // ── Selection state management ──
  describe('selection state', () => {
    it('selectEdge sets edge and clears others', () => {
      s().selectEdge('e1');
      expect(s().selectedEdgeId).toBe('e1');
      expect(s().selectedFaceId).toBeNull();
      expect(s().selectedPlacementId).toBeNull();
      expect(s().selectedVertexId).toBeNull();
    });

    it('selectFace sets face and clears others', () => {
      s().selectEdge('e1');
      s().selectFace('f1');
      expect(s().selectedFaceId).toBe('f1');
      expect(s().selectedEdgeId).toBeNull();
    });

    it('selectPlacement sets placement and clears others', () => {
      s().selectFace('f1');
      s().selectPlacement('p1');
      expect(s().selectedPlacementId).toBe('p1');
      expect(s().selectedFaceId).toBeNull();
    });

    it('clearSelection clears all', () => {
      s().selectEdge('e1');
      s().clearSelection();
      expect(s().selectedEdgeId).toBeNull();
      expect(s().selectedFaceId).toBeNull();
      expect(s().selectedPlacementId).toBeNull();
      expect(s().selectedVertexId).toBeNull();
    });

    it('selectEdge(null) deselects edge', () => {
      s().selectEdge('e1');
      s().selectEdge(null);
      expect(s().selectedEdgeId).toBeNull();
    });
  });

  // ── Hover state ──
  describe('hover state', () => {
    it('sets hovered edge', () => {
      s().setHoveredEdge('e1');
      expect(s().hoveredEdgeId).toBe('e1');
    });

    it('sets hovered face', () => {
      s().setHoveredFace('f1');
      expect(s().hoveredFaceId).toBe('f1');
    });

    it('sets cursor world position', () => {
      s().setCursorWorld({ x: 3.5, y: 2.1 });
      expect(s().cursorWorld).toEqual({ x: 3.5, y: 2.1 });
    });

    it('sets cursor grid position', () => {
      s().setCursorGrid({ x: 3, y: 2 });
      expect(s().cursorGrid).toEqual({ x: 3, y: 2 });
    });
  });

  // ── Zone assignment ──
  describe('zone assignment', () => {
    it('assignZone creates zone for face', () => {
      s().addWall(0, 0, 5, 0);
      s().addWall(5, 0, 5, 4);
      s().addWall(5, 4, 0, 4);
      s().addWall(0, 4, 0, 0);

      const story = s().getActiveStory();
      const face = story.geometry.faces[0];
      // Zone should already be auto-assigned, but let's test manual assignment
      s().assignZone(face.id, 'Living Room', 295);
      const zone = s().getZoneForFace(face.id);
      expect(zone).toBeDefined();
      expect(zone!.name).toBe('Living Room');
      expect(zone!.temperature).toBe(295);
    });

    it('updateZone modifies zone properties', () => {
      s().addWall(0, 0, 5, 0);
      s().addWall(5, 0, 5, 4);
      s().addWall(5, 4, 0, 4);
      s().addWall(0, 4, 0, 0);

      const story = s().getActiveStory();
      const face = story.geometry.faces[0];
      s().updateZone(face.id, { temperature: 300 });
      const zone = s().getZoneForFace(face.id);
      expect(zone!.temperature).toBe(300);
    });
  });

  // ── Placement management ──
  describe('placement management', () => {
    it('addPlacement creates placement on edge', () => {
      s().addWall(0, 0, 5, 0);
      const edge = s().getActiveGeometry().edges[0];
      s().addPlacement(edge.id, 0.5, 'door');

      const story = s().getActiveStory();
      expect(story.placements).toHaveLength(1);
      expect(story.placements[0].type).toBe('door');
      expect(story.placements[0].alpha).toBe(0.5);
    });

    it('addPlacement clamps alpha to [0, 1]', () => {
      s().addWall(0, 0, 5, 0);
      const edge = s().getActiveGeometry().edges[0];
      s().addPlacement(edge.id, 1.5, 'window');

      const story = s().getActiveStory();
      expect(story.placements[0].alpha).toBe(1.0);
    });

    it('addPlacement selects the new placement', () => {
      s().addWall(0, 0, 5, 0);
      const edge = s().getActiveGeometry().edges[0];
      s().addPlacement(edge.id, 0.5, 'door');

      const story = s().getActiveStory();
      expect(s().selectedPlacementId).toBe(story.placements[0].id);
    });

    it('removePlacement removes and clears selection', () => {
      s().addWall(0, 0, 5, 0);
      const edge = s().getActiveGeometry().edges[0];
      s().addPlacement(edge.id, 0.5, 'door');

      const plId = s().getActiveStory().placements[0].id;
      s().removePlacement(plId);
      expect(s().getActiveStory().placements).toHaveLength(0);
      expect(s().selectedPlacementId).toBeNull();
    });

    it('updatePlacement modifies placement properties', () => {
      s().addWall(0, 0, 5, 0);
      const edge = s().getActiveGeometry().edges[0];
      s().addPlacement(edge.id, 0.5, 'door');

      const plId = s().getActiveStory().placements[0].id;
      s().updatePlacement(plId, { alpha: 0.3, isConfigured: true });

      const pl = s().getActiveStory().placements[0];
      expect(pl.alpha).toBe(0.3);
      expect(pl.isConfigured).toBe(true);
    });
  });

  // ── Grid settings ──
  describe('grid settings', () => {
    it('defaults to 0.1m grid with snap enabled', () => {
      expect(s().gridSize).toBe(0.1);
      expect(s().snapToGrid).toBe(true);
      expect(s().showGrid).toBe(true);
    });

    it('setGridSize changes grid size', () => {
      s().setGridSize(0.5);
      expect(s().gridSize).toBe(0.5);
    });

    it('setSnapToGrid toggles snapping', () => {
      s().setSnapToGrid(false);
      expect(s().snapToGrid).toBe(false);
    });

    it('setShowGrid toggles grid visibility', () => {
      s().setShowGrid(false);
      expect(s().showGrid).toBe(false);
    });
  });

  // ── Camera ──
  describe('camera', () => {
    it('defaults to zoom 50', () => {
      expect(s().cameraZoom).toBe(50);
    });

    it('setCameraZoom changes zoom', () => {
      s().setCameraZoom(100);
      expect(s().cameraZoom).toBe(100);
    });
  });

  // ── Sidebar ──
  describe('sidebar', () => {
    it('setSidebarOpen toggles sidebar', () => {
      s().setSidebarOpen(true);
      expect(s().sidebarOpen).toBe(true);
    });

    it('setSidebarTab changes tab', () => {
      s().setSidebarTab('properties');
      expect(s().sidebarTab).toBe('properties');
    });
  });

  // ── Transient playback ──
  describe('transient playback', () => {
    it('defaults to step 0', () => {
      expect(s().currentTransientStep).toBe(0);
    });

    it('setCurrentTransientStep changes step', () => {
      s().setCurrentTransientStep(42);
      expect(s().currentTransientStep).toBe(42);
    });
  });

  // ── Background image ──
  describe('background image', () => {
    it('sets background image for a story', () => {
      const storyId = s().stories[0].id;
      s().setBackgroundImage(storyId, {
        url: 'test.png', opacity: 0.5,
        scalePixelsPerMeter: 100, offsetX: 10, offsetY: 20,
      });
      const story = s().stories[0];
      expect(story.backgroundImage).toBeDefined();
      expect(story.backgroundImage!.url).toBe('test.png');
      expect(story.backgroundImage!.opacity).toBe(0.5);
    });

    it('clears background image with undefined', () => {
      const storyId = s().stories[0].id;
      s().setBackgroundImage(storyId, {
        url: 'test.png', opacity: 0.5,
        scalePixelsPerMeter: 100, offsetX: 0, offsetY: 0,
      });
      s().setBackgroundImage(storyId, undefined);
      expect(s().stories[0].backgroundImage).toBeUndefined();
    });
  });

  // ── clearAll ──
  describe('clearAll', () => {
    it('resets all state to defaults', () => {
      s().setToolMode('wall');
      s().setAppMode('results');
      s().addStory();
      s().selectEdge('e1');
      s().startWallPreview(1, 2);

      s().clearAll();

      expect(s().toolMode).toBe('select');
      expect(s().appMode).toBe('edit');
      expect(s().stories).toHaveLength(1);
      expect(s().stories[0].level).toBe(0);
      expect(s().selectedEdgeId).toBeNull();
      expect(s().wallPreview.active).toBe(false);
    });

    it('sets activeStoryId to the fresh story', () => {
      s().clearAll();
      expect(s().activeStoryId).toBe(s().stories[0].id);
    });
  });
});
