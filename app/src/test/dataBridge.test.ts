import { describe, it, expect, beforeEach } from 'vitest';
import { canvasToTopology, validateModel } from '../model/dataBridge';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '../store/useAppStore';

// Reset both stores before each test
beforeEach(() => {
  useCanvasStore.getState().clearAll();
  useAppStore.getState().clearAll();
});

// Helper: build a rectangular room via the canvas store wall workflow
function buildRoomViaStore(x: number, y: number, w: number, h: number) {
  const store = useCanvasStore.getState();
  store.addWall(x, y, x + w, y);
  store.addWall(x + w, y, x + w, y + h);
  store.addWall(x + w, y + h, x, y + h);
  store.addWall(x, y + h, x, y);
}

describe('dataBridge.ts', () => {
  // ── canvasToTopology: simple geometry ──
  describe('canvasToTopology — single room', () => {
    it('creates ambient node (ID=0) and one zone node', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const topo = canvasToTopology();

      expect(topo.nodes.length).toBeGreaterThanOrEqual(2);
      const ambient = topo.nodes.find(n => n.type === 'ambient');
      expect(ambient).toBeDefined();
      expect(ambient!.id).toBe(0);
      expect(ambient!.name).toBe('室外');

      const zones = topo.nodes.filter(n => n.type === 'normal');
      expect(zones.length).toBeGreaterThanOrEqual(1);
    });

    it('zone node has correct volume (area * height)', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const topo = canvasToTopology();
      const zone = topo.nodes.find(n => n.type === 'normal');
      expect(zone).toBeDefined();
      // 5*4 = 20 m^2, height = 3.0m => volume = 60 m^3
      expect(zone!.volume).toBeCloseTo(60.0, 0);
    });

    it('ambient node uses appStore temperature and pressure', () => {
      useAppStore.getState().setAmbient({ ambientTemperature: 280, ambientPressure: 101000 });
      buildRoomViaStore(0, 0, 5, 4);
      const topo = canvasToTopology();
      const ambient = topo.nodes.find(n => n.type === 'ambient');
      expect(ambient!.temperature).toBe(280);
      expect(ambient!.pressure).toBe(101000);
    });
  });

  // ── canvasToTopology: multi-room ──
  describe('canvasToTopology — multi-room', () => {
    it('creates multiple zone nodes for adjacent rooms', () => {
      // Room 1: (0,0)-(5,4)
      const s = useCanvasStore.getState;
      s().addWall(0, 0, 5, 0);
      s().addWall(5, 0, 5, 4);
      s().addWall(5, 4, 0, 4);
      s().addWall(0, 4, 0, 0);
      // Room 2: (5,0)-(10,4) shares wall at x=5
      s().addWall(5, 0, 10, 0);
      s().addWall(10, 0, 10, 4);
      s().addWall(10, 4, 5, 4);

      const topo = canvasToTopology();
      const zones = topo.nodes.filter(n => n.type === 'normal');
      expect(zones.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── canvasToTopology: ambient node creation ──
  describe('canvasToTopology — ambient node', () => {
    it('always includes exactly one ambient node', () => {
      buildRoomViaStore(0, 0, 3, 3);
      const topo = canvasToTopology();
      const ambients = topo.nodes.filter(n => n.type === 'ambient');
      expect(ambients).toHaveLength(1);
    });

    it('ambient node has elevation 0 and volume 0', () => {
      buildRoomViaStore(0, 0, 3, 3);
      const topo = canvasToTopology();
      const ambient = topo.nodes.find(n => n.type === 'ambient')!;
      expect(ambient.elevation).toBe(0);
      expect(ambient.volume).toBe(0);
    });
  });

  // ── canvasToTopology: placement → link conversion ──
  describe('canvasToTopology — placement to link', () => {
    it('converts door placement to TwoWayFlow link', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const story = useCanvasStore.getState().getActiveStory();
      const edge = story.geometry.edges[0];
      useCanvasStore.getState().addPlacement(edge.id, 0.5, 'door');

      const topo = canvasToTopology();
      expect(topo.links.length).toBeGreaterThanOrEqual(1);
      const link = topo.links[0];
      expect(link.element).toBeDefined();
      expect((link.element as any).type).toBe('TwoWayFlow');
    });

    it('converts window placement to PowerLawOrifice link', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const story = useCanvasStore.getState().getActiveStory();
      const edge = story.geometry.edges[0];
      useCanvasStore.getState().addPlacement(edge.id, 0.5, 'window');

      const topo = canvasToTopology();
      expect(topo.links.length).toBeGreaterThanOrEqual(1);
      const link = topo.links[0];
      expect((link.element as any).type).toBe('PowerLawOrifice');
    });

    it('exterior wall placement connects zone to ambient (ID=0)', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const story = useCanvasStore.getState().getActiveStory();
      const edge = story.geometry.edges[0];
      useCanvasStore.getState().addPlacement(edge.id, 0.5, 'door');

      const topo = canvasToTopology();
      const link = topo.links[0];
      // One end should be 0 (ambient)
      expect(link.from === 0 || link.to === 0).toBe(true);
    });

    it('internal wall placement connects two zones', () => {
      // Two adjacent rooms sharing a wall
      const s = useCanvasStore.getState;
      s().addWall(0, 0, 5, 0);
      s().addWall(5, 0, 5, 4);
      s().addWall(5, 4, 0, 4);
      s().addWall(0, 4, 0, 0);
      s().addWall(5, 0, 10, 0);
      s().addWall(10, 0, 10, 4);
      s().addWall(10, 4, 5, 4);

      const story = useCanvasStore.getState().getActiveStory();
      // Find the shared wall at x=5
      const sharedEdge = story.geometry.edges.find(e => {
        const v1 = story.geometry.vertices.find(v => v.id === e.vertexIds[0]);
        const v2 = story.geometry.vertices.find(v => v.id === e.vertexIds[1]);
        return v1 && v2 && v1.x === 5 && v2.x === 5;
      });
      expect(sharedEdge).toBeDefined();

      useCanvasStore.getState().addPlacement(sharedEdge!.id, 0.5, 'door');
      const topo = canvasToTopology();
      const link = topo.links.find(l => l.from !== 0 && l.to !== 0);
      expect(link).toBeDefined(); // both ends are non-ambient zones
    });

    it('link elevation is calculated from story level', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const story = useCanvasStore.getState().getActiveStory();
      const edge = story.geometry.edges[0];
      useCanvasStore.getState().addPlacement(edge.id, 0.5, 'door');

      const topo = canvasToTopology();
      const link = topo.links[0];
      // level=0, height=3.0 => elevation = 0*3 + 3*0.5 = 1.5
      expect(link.elevation).toBeCloseTo(1.5, 1);
    });

    it('skips placements on orphan edges (no faces)', () => {
      // Single wall with no enclosed room
      useCanvasStore.getState().addWall(0, 0, 5, 0);
      const story = useCanvasStore.getState().getActiveStory();
      const edge = story.geometry.edges[0];
      useCanvasStore.getState().addPlacement(edge.id, 0.5, 'door');

      const topo = canvasToTopology();
      expect(topo.links).toHaveLength(0);
    });
  });

  // ── canvasToTopology: species/sources/schedules merging ──
  describe('canvasToTopology — merging appStore data', () => {
    it('includes species when present', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().addSpecies({
        id: 1, name: 'CO2', molarMass: 0.044, decayRate: 0,
        outdoorConcentration: 4e-4, isTrace: true,
        diffusionCoeff: 0, meanDiameter: 0, effectiveDensity: 0,
      });
      const topo = canvasToTopology();
      expect(topo.species).toBeDefined();
      expect(topo.species).toHaveLength(1);
      expect(topo.species![0].name).toBe('CO2');
    });

    it('includes sources when present', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().addSpecies({
        id: 1, name: 'CO2', molarMass: 0.044, decayRate: 0,
        outdoorConcentration: 4e-4, isTrace: true,
        diffusionCoeff: 0, meanDiameter: 0, effectiveDensity: 0,
      });
      useAppStore.getState().addSource({
        zoneId: 1, speciesId: 1, generationRate: 1e-5,
        removalRate: 0, scheduleId: -1, type: 'Constant',
      });
      const topo = canvasToTopology();
      expect(topo.sources).toBeDefined();
      expect(topo.sources).toHaveLength(1);
    });

    it('includes schedules when present', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().addSchedule({
        id: 1, name: 'Test Schedule',
        points: [{ time: 0, value: 1 }, { time: 3600, value: 0 }],
      });
      const topo = canvasToTopology();
      expect(topo.schedules).toBeDefined();
      expect(topo.schedules).toHaveLength(1);
    });

    it('includes occupants when present', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().addOccupant({
        id: 1, name: 'Person A', breathingRate: 1.2e-4,
        co2EmissionRate: 3.3e-6,
        schedule: [{ startTime: 0, endTime: 3600, zoneId: 0 }],
      });
      const topo = canvasToTopology();
      expect(topo.occupants).toBeDefined();
      expect(topo.occupants).toHaveLength(1);
    });

    it('includes weather when enabled', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().setWeatherConfig({
        enabled: true, filePath: 'test.wth',
        records: [{ month: 1, day: 1, hour: 1, temperature: 280, windSpeed: 3, windDirection: 0, pressure: 101325, humidity: 0.5 }],
      });
      const topo = canvasToTopology();
      expect(topo.weather).toBeDefined();
      expect(topo.weather!.enabled).toBe(true);
    });

    it('excludes weather when disabled', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().setWeatherConfig({ enabled: false });
      const topo = canvasToTopology();
      expect(topo.weather).toBeUndefined();
    });

    it('includes AHS systems when present', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().addAHS({
        id: 0, name: 'AHS-1', supplyFlow: 0.1, returnFlow: 0.1,
        outdoorAirFlow: 0.02, exhaustFlow: 0.02, supplyTemperature: 295,
        supplyZones: [], returnZones: [],
        outdoorAirScheduleId: -1, supplyFlowScheduleId: -1,
      });
      const topo = canvasToTopology();
      expect(topo.ahsSystems).toBeDefined();
      expect(topo.ahsSystems).toHaveLength(1);
    });

    it('includes transient config when species exist', () => {
      buildRoomViaStore(0, 0, 5, 4);
      useAppStore.getState().addSpecies({
        id: 1, name: 'CO2', molarMass: 0.044, decayRate: 0,
        outdoorConcentration: 4e-4, isTrace: true,
        diffusionCoeff: 0, meanDiameter: 0, effectiveDensity: 0,
      });
      const topo = canvasToTopology();
      expect(topo.transient).toBeDefined();
    });

    it('omits species/sources/schedules when empty', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const topo = canvasToTopology();
      expect(topo.species).toBeUndefined();
      expect(topo.sources).toBeUndefined();
      expect(topo.schedules).toBeUndefined();
    });
  });

  // ── canvasToTopology: fallback to legacy AppStore ──
  describe('canvasToTopology — legacy fallback', () => {
    it('falls back to AppStore exportTopology when canvas has no zones', () => {
      // No canvas geometry, but add legacy nodes
      useAppStore.getState().addNode({ name: 'Room', type: 'normal' });
      const topo = canvasToTopology();
      expect(topo.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── canvasToTopology: topology structure ──
  describe('canvasToTopology — topology structure', () => {
    it('includes description', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const topo = canvasToTopology();
      expect(topo.description).toBeDefined();
    });

    it('includes ambient conditions from appStore', () => {
      useAppStore.getState().setAmbient({ windSpeed: 5, windDirection: 90 });
      buildRoomViaStore(0, 0, 5, 4);
      const topo = canvasToTopology();
      expect(topo.ambient).toBeDefined();
      expect(topo.ambient!.windSpeed).toBe(5);
      expect(topo.ambient!.windDirection).toBe(90);
    });
  });

  // ── validateModel ──
  describe('validateModel', () => {
    it('returns error for empty model', () => {
      const { errors } = validateModel();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('returns no errors for valid canvas model', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const { errors } = validateModel();
      expect(errors).toHaveLength(0);
    });

    it('warns about unconfigured placements', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const story = useCanvasStore.getState().getActiveStory();
      const edge = story.geometry.edges[0];
      useCanvasStore.getState().addPlacement(edge.id, 0.5, 'door');

      const { warnings } = validateModel();
      expect(warnings.some(w => w.includes('尚未配置'))).toBe(true);
    });

    it('warns about isolated zones (no placements)', () => {
      buildRoomViaStore(0, 0, 5, 4);
      const { warnings } = validateModel();
      expect(warnings.some(w => w.includes('没有气流路径'))).toBe(true);
    });

    it('returns no errors for legacy AppStore model', () => {
      useAppStore.getState().addNode({ name: 'Room', type: 'normal' });
      const { errors } = validateModel();
      expect(errors).toHaveLength(0);
    });
  });
});
