import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/useAppStore';

// Reset store before each test
beforeEach(() => {
  useAppStore.getState().clearAll();
});

describe('useAppStore', () => {
  describe('nodes', () => {
    it('adds a node with auto-incrementing ID', () => {
      useAppStore.getState().addNode({ name: '客厅', type: 'normal' });
      const { nodes, nextId } = useAppStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].name).toBe('客厅');
      expect(nodes[0].type).toBe('normal');
      expect(nextId).toBe(2);
    });

    it('updates a node', () => {
      useAppStore.getState().addNode({ name: '卧室' });
      const id = useAppStore.getState().nodes[0].id;
      useAppStore.getState().updateNode(id, { temperature: 300 });
      expect(useAppStore.getState().nodes[0].temperature).toBe(300);
    });

    it('removes a node and its connected links', () => {
      useAppStore.getState().addNode({ name: 'A' });
      useAppStore.getState().addNode({ name: 'B' });
      const [a, b] = useAppStore.getState().nodes;
      useAppStore.getState().addLink({ from: a.id, to: b.id });
      expect(useAppStore.getState().links).toHaveLength(1);

      useAppStore.getState().removeNode(a.id);
      expect(useAppStore.getState().nodes).toHaveLength(1);
      expect(useAppStore.getState().links).toHaveLength(0);
    });
  });

  describe('links', () => {
    it('adds a link with default element', () => {
      useAppStore.getState().addNode({ name: 'A' });
      useAppStore.getState().addNode({ name: 'B' });
      const [a, b] = useAppStore.getState().nodes;
      useAppStore.getState().addLink({ from: a.id, to: b.id });
      const link = useAppStore.getState().links[0];
      expect(link.from).toBe(a.id);
      expect(link.to).toBe(b.id);
      expect(link.element.type).toBe('PowerLawOrifice');
    });

    it('removes a link', () => {
      useAppStore.getState().addNode({ name: 'A' });
      useAppStore.getState().addNode({ name: 'B' });
      const [a, b] = useAppStore.getState().nodes;
      useAppStore.getState().addLink({ from: a.id, to: b.id });
      const linkId = useAppStore.getState().links[0].id;
      useAppStore.getState().removeLink(linkId);
      expect(useAppStore.getState().links).toHaveLength(0);
    });
  });

  describe('species & sources', () => {
    it('adds and removes species, cascading source removal', () => {
      useAppStore.getState().addSpecies({ id: 1, name: 'CO2', molarMass: 0.044, decayRate: 0, outdoorConcentration: 4e-4, isTrace: true, diffusionCoeff: 0, meanDiameter: 0, effectiveDensity: 0 });
      useAppStore.getState().addSource({ zoneId: 1, speciesId: 1, generationRate: 1e-5, removalRate: 0, scheduleId: -1, type: 'Constant' });
      expect(useAppStore.getState().species).toHaveLength(1);
      expect(useAppStore.getState().sources).toHaveLength(1);

      useAppStore.getState().removeSpecies(1);
      expect(useAppStore.getState().species).toHaveLength(0);
      expect(useAppStore.getState().sources).toHaveLength(0);
    });
  });

  describe('weather & AHS', () => {
    it('sets weather config', () => {
      useAppStore.getState().setWeatherConfig({ enabled: true, filePath: 'test.wth' });
      const wc = useAppStore.getState().weatherConfig;
      expect(wc.enabled).toBe(true);
      expect(wc.filePath).toBe('test.wth');
      expect(wc.records).toEqual([]);
    });

    it('adds, updates, and removes AHS', () => {
      useAppStore.getState().addAHS({
        id: 0, name: 'AHS-1', supplyFlow: 0.1, returnFlow: 0.1,
        outdoorAirFlow: 0.02, exhaustFlow: 0.02, supplyTemperature: 295.15,
        supplyZones: [], returnZones: [],
        outdoorAirScheduleId: -1, supplyFlowScheduleId: -1,
      });
      expect(useAppStore.getState().ahsSystems).toHaveLength(1);

      useAppStore.getState().updateAHS(0, { supplyFlow: 0.2 });
      expect(useAppStore.getState().ahsSystems[0].supplyFlow).toBe(0.2);

      useAppStore.getState().removeAHS(0);
      expect(useAppStore.getState().ahsSystems).toHaveLength(0);
    });
  });

  describe('exportTopology', () => {
    it('exports nodes, links, and ambient conditions', () => {
      useAppStore.getState().addNode({ name: '室外', type: 'ambient', temperature: 283.15 });
      useAppStore.getState().addNode({ name: '房间', type: 'normal' });
      const [amb, room] = useAppStore.getState().nodes;
      useAppStore.getState().addLink({ from: amb.id, to: room.id });

      const topo = useAppStore.getState().exportTopology();
      expect(topo.nodes).toHaveLength(2);
      expect(topo.links).toHaveLength(1);
      expect(topo.ambient.temperature).toBe(283.15);
    });

    it('includes weather when enabled', () => {
      useAppStore.getState().setWeatherConfig({ enabled: true, filePath: 'w.wth', records: [{ month: 1, day: 1, hour: 1, temperature: 280, windSpeed: 3, windDirection: 0, pressure: 101325, humidity: 0.5 }] });
      const topo = useAppStore.getState().exportTopology();
      expect(topo.weather).toBeDefined();
      expect(topo.weather!.records).toHaveLength(1);
    });

    it('excludes weather when disabled', () => {
      useAppStore.getState().setWeatherConfig({ enabled: false });
      const topo = useAppStore.getState().exportTopology();
      expect(topo.weather).toBeUndefined();
    });

    it('includes AHS when present', () => {
      useAppStore.getState().addAHS({
        id: 0, name: 'AHS', supplyFlow: 0.1, returnFlow: 0.1,
        outdoorAirFlow: 0.02, exhaustFlow: 0.02, supplyTemperature: 295,
        supplyZones: [], returnZones: [],
        outdoorAirScheduleId: -1, supplyFlowScheduleId: -1,
      });
      const topo = useAppStore.getState().exportTopology();
      expect(topo.ahsSystems).toHaveLength(1);
    });
  });

  describe('loadFromJson', () => {
    it('round-trips through export/load', () => {
      useAppStore.getState().addNode({ name: '室外', type: 'ambient' });
      useAppStore.getState().addNode({ name: '房间A' });
      const [amb, room] = useAppStore.getState().nodes;
      useAppStore.getState().addLink({ from: amb.id, to: room.id });
      useAppStore.getState().addSpecies({ id: 1, name: 'CO2', molarMass: 0.044, decayRate: 0, outdoorConcentration: 4e-4, isTrace: true, diffusionCoeff: 0, meanDiameter: 0, effectiveDensity: 0 });

      const exported = useAppStore.getState().exportTopology();
      useAppStore.getState().clearAll();
      expect(useAppStore.getState().nodes).toHaveLength(0);

      useAppStore.getState().loadFromJson(exported);
      expect(useAppStore.getState().nodes).toHaveLength(2);
      expect(useAppStore.getState().links).toHaveLength(1);
      expect(useAppStore.getState().species).toHaveLength(1);
    });

    it('loads weather and AHS from JSON', () => {
      const json = {
        description: 'test',
        ambient: { temperature: 283, pressure: 0, windSpeed: 0, windDirection: 0 },
        nodes: [{ id: 0, name: 'amb', type: 'ambient', temperature: 283, elevation: 0, volume: 0, pressure: 0 }],
        links: [],
        weather: { enabled: true, filePath: 'x.wth', records: [{ month: 1, day: 1, hour: 1, temperature: 280, windSpeed: 2, windDirection: 90, pressure: 101325, humidity: 0.6 }] },
        ahsSystems: [{ id: 0, name: 'AHS-1', supplyFlow: 0.1, returnFlow: 0.1, outdoorAirFlow: 0.02, exhaustFlow: 0.02, supplyTemperature: 295, supplyZones: [], returnZones: [], outdoorAirScheduleId: -1, supplyFlowScheduleId: -1 }],
      };
      useAppStore.getState().loadFromJson(json as any);
      expect(useAppStore.getState().weatherConfig.enabled).toBe(true);
      expect(useAppStore.getState().weatherConfig.records).toHaveLength(1);
      expect(useAppStore.getState().ahsSystems).toHaveLength(1);
    });
  });

  describe('occupants', () => {
    it('adds, updates, and removes occupants', () => {
      useAppStore.getState().addOccupant({
        id: 1, name: '人员A', breathingRate: 1.2e-4, co2EmissionRate: 3.3e-6,
        schedule: [{ startTime: 0, endTime: 3600, zoneId: 0 }],
      });
      expect(useAppStore.getState().occupants).toHaveLength(1);
      expect(useAppStore.getState().occupants[0].name).toBe('人员A');

      useAppStore.getState().updateOccupant(1, { breathingRate: 2.0e-4 });
      expect(useAppStore.getState().occupants[0].breathingRate).toBe(2.0e-4);

      useAppStore.getState().removeOccupant(1);
      expect(useAppStore.getState().occupants).toHaveLength(0);
    });

    it('occupant schedule contains zone assignments', () => {
      useAppStore.getState().addOccupant({
        id: 2, name: '人员B', breathingRate: 1.2e-4, co2EmissionRate: 3.3e-6,
        schedule: [
          { startTime: 0, endTime: 1800, zoneId: 0 },
          { startTime: 1800, endTime: 3600, zoneId: 1 },
        ],
      });
      const occ = useAppStore.getState().occupants[0];
      expect(occ.schedule).toHaveLength(2);
      expect(occ.schedule[1].zoneId).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('resets all state', () => {
      useAppStore.getState().addNode({ name: 'X' });
      useAppStore.getState().addSpecies({ id: 1, name: 'CO2', molarMass: 0.044, decayRate: 0, outdoorConcentration: 0, isTrace: true, diffusionCoeff: 0, meanDiameter: 0, effectiveDensity: 0 });
      useAppStore.getState().setWeatherConfig({ enabled: true });
      useAppStore.getState().addAHS({ id: 0, name: 'A', supplyFlow: 0.1, returnFlow: 0.1, outdoorAirFlow: 0.02, exhaustFlow: 0.02, supplyTemperature: 295, supplyZones: [], returnZones: [], outdoorAirScheduleId: -1, supplyFlowScheduleId: -1 });

      useAppStore.getState().clearAll();
      const s = useAppStore.getState();
      expect(s.nodes).toHaveLength(0);
      expect(s.species).toHaveLength(0);
      expect(s.weatherConfig.enabled).toBe(false);
      expect(s.ahsSystems).toHaveLength(0);
      expect(s.nextId).toBe(1);
    });
  });
});
