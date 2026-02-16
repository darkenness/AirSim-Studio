import { create } from 'zustand';
import { temporal } from 'zundo';
import type { AppState, ZoneNode, AirflowLink, TopologyJson, Species, Source, Schedule, TransientResult, Occupant, ControlSystem, AHSConfig, FilterConfig } from '../types';

export const useAppStore = create<AppState>()(temporal((set, get) => ({
  // Model data
  nodes: [],
  links: [],
  ambientTemperature: 283.15,
  ambientPressure: 0.0,
  windSpeed: 0.0,
  windDirection: 0.0,

  // UI state
  selectedNodeId: null,
  selectedLinkId: null,
  toolMode: 'select',
  nextId: 1,

  // Contaminant model
  species: [],
  sources: [],
  schedules: [],
  weekSchedules: [],
  dayTypes: [],
  occupants: [],
  controlSystem: { sensors: [], controllers: [], actuators: [] },
  transientConfig: { startTime: 0, endTime: 3600, timeStep: 60, outputInterval: 60 },

  // Weather & AHS
  weatherConfig: { enabled: false, filePath: '', records: [] },
  ahsSystems: [],
  filterConfigs: [],

  // Simulation
  result: null,
  transientResult: null,
  isRunning: false,
  error: null,

  // Actions
  addNode: (partial) => set((state) => {
    const id = state.nextId;
    const node: ZoneNode = {
      id,
      name: partial.name || `房间 ${id}`,
      type: partial.type || 'normal',
      temperature: partial.temperature ?? 293.15,
      elevation: partial.elevation ?? 0.0,
      volume: partial.volume ?? 50.0,
      pressure: partial.pressure ?? 0.0,
      x: partial.x ?? 100,
      y: partial.y ?? 100,
      width: partial.width ?? 120,
      height: partial.height ?? 80,
    };
    return { nodes: [...state.nodes, node], nextId: id + 1, selectedNodeId: id, selectedLinkId: null };
  }),

  updateNode: (id, updates) => set((state) => ({
    nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
  })),

  removeNode: (id) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== id),
    links: state.links.filter((l) => l.from !== id && l.to !== id),
    selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
  })),

  addLink: (partial) => set((state) => {
    const id = state.nextId;
    const link: AirflowLink = {
      id,
      from: partial.from!,
      to: partial.to!,
      elevation: partial.elevation ?? 1.5,
      element: partial.element ?? { type: 'PowerLawOrifice', C: 0.001, n: 0.65 },
      x: partial.x ?? 0,
      y: partial.y ?? 0,
    };
    return { links: [...state.links, link], nextId: id + 1, selectedLinkId: id, selectedNodeId: null };
  }),

  updateLink: (id, updates) => set((state) => ({
    links: state.links.map((l) => (l.id === id ? { ...l, ...updates } : l)),
  })),

  removeLink: (id) => set((state) => ({
    links: state.links.filter((l) => l.id !== id),
    selectedLinkId: state.selectedLinkId === id ? null : state.selectedLinkId,
  })),

  selectNode: (id) => set({ selectedNodeId: id, selectedLinkId: null }),
  selectLink: (id) => set({ selectedLinkId: id, selectedNodeId: null }),
  setToolMode: (mode) => set({ toolMode: mode }),

  setAmbient: (updates) => set((state) => ({
    ambientTemperature: updates.ambientTemperature ?? state.ambientTemperature,
    ambientPressure: updates.ambientPressure ?? state.ambientPressure,
    windSpeed: updates.windSpeed ?? state.windSpeed,
    windDirection: updates.windDirection ?? state.windDirection,
  })),
  setResult: (result) => set({ result }),
  setIsRunning: (running) => set({ isRunning: running }),
  setError: (error) => set({ error }),

  addSpecies: (sp: Species) => set((state) => ({ species: [...state.species, sp] })),
  removeSpecies: (id: number) => set((state) => ({
    species: state.species.filter((s) => s.id !== id),
    sources: state.sources.filter((s) => s.speciesId !== id),
  })),
  updateSpecies: (id: number, updates) => set((state) => ({
    species: state.species.map((s) => (s.id === id ? { ...s, ...updates } : s)),
  })),
  addSource: (src: Source) => set((state) => ({ sources: [...state.sources, src] })),
  removeSource: (idx: number) => set((state) => ({
    sources: state.sources.filter((_, i) => i !== idx),
  })),
  updateSource: (idx: number, updates) => set((state) => ({
    sources: state.sources.map((s, i) => (i === idx ? { ...s, ...updates } : s)),
  })),
  addSchedule: (sch: Schedule) => set((state) => ({ schedules: [...state.schedules, sch] })),
  updateSchedule: (id, updates) => set((state) => ({
    schedules: state.schedules.map(s => s.id === id ? { ...s, ...updates } : s),
  })),
  removeSchedule: (id) => set((state) => ({
    schedules: state.schedules.filter(s => s.id !== id),
  })),
  addWeekSchedule: (ws) => set((state) => ({ weekSchedules: [...state.weekSchedules, ws] })),
  updateWeekSchedule: (id, updates) => set((state) => ({
    weekSchedules: state.weekSchedules.map(ws => ws.id === id ? { ...ws, ...updates } : ws),
  })),
  removeWeekSchedule: (id) => set((state) => ({
    weekSchedules: state.weekSchedules.filter(ws => ws.id !== id),
  })),
  addDayType: (dt) => set((state) => ({ dayTypes: [...state.dayTypes, dt] })),
  updateDayType: (id, updates) => set((state) => ({
    dayTypes: state.dayTypes.map(dt => dt.id === id ? { ...dt, ...updates } : dt),
  })),
  removeDayType: (id) => set((state) => ({
    dayTypes: state.dayTypes.filter(dt => dt.id !== id),
  })),
  addOccupant: (occ: Occupant) => set((state) => ({ occupants: [...state.occupants, occ] })),
  removeOccupant: (id: number) => set((state) => ({
    occupants: state.occupants.filter((o) => o.id !== id),
  })),
  updateOccupant: (id: number, updates) => set((state) => ({
    occupants: state.occupants.map((o) => (o.id === id ? { ...o, ...updates } : o)),
  })),
  setControlSystem: (cs: ControlSystem) => set({ controlSystem: cs }),
  setTransientConfig: (config) => set((state) => ({
    transientConfig: { ...state.transientConfig, ...config },
  })),
  setTransientResult: (result: TransientResult | null) => set({ transientResult: result }),

  setWeatherConfig: (config) => set((state) => ({
    weatherConfig: { ...state.weatherConfig, ...config },
  })),
  addAHS: (ahs: AHSConfig) => set((state) => ({ ahsSystems: [...state.ahsSystems, ahs] })),
  updateAHS: (id: number, updates) => set((state) => ({
    ahsSystems: state.ahsSystems.map((a) => (a.id === id ? { ...a, ...updates } : a)),
  })),
  removeAHS: (id: number) => set((state) => ({
    ahsSystems: state.ahsSystems.filter((a) => a.id !== id),
  })),

  addFilterConfig: (fc) => set((state) => ({ filterConfigs: [...state.filterConfigs, fc] })),
  updateFilterConfig: (id, updates) => set((state) => ({
    filterConfigs: state.filterConfigs.map(f => f.id === id ? { ...f, ...updates } as FilterConfig : f),
  })),
  removeFilterConfig: (id) => set((state) => ({
    filterConfigs: state.filterConfigs.filter(f => f.id !== id),
  })),

  exportTopology: (): TopologyJson => {
    const state = get();
    const ambientNodes = state.nodes.filter((n) => n.type === 'ambient');
    const ambTemp = ambientNodes.length > 0 ? ambientNodes[0].temperature : state.ambientTemperature;

    return {
      description: 'CONTAM-Next model',
      ambient: {
        temperature: ambTemp,
        pressure: state.ambientPressure,
        windSpeed: state.windSpeed,
        windDirection: state.windDirection,
      },
      nodes: state.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        temperature: n.temperature,
        elevation: n.elevation,
        volume: n.volume,
        pressure: n.pressure,
      })),
      links: state.links.map((l) => ({
        id: l.id,
        from: l.from,
        to: l.to,
        elevation: l.elevation,
        element: l.element,
      })),
      species: state.species.length > 0 ? state.species : undefined,
      sources: state.sources.length > 0 ? state.sources : undefined,
      schedules: state.schedules.length > 0 ? state.schedules : undefined,
      occupants: state.occupants.length > 0 ? state.occupants : undefined,
      controls: (state.controlSystem.sensors.length > 0 || state.controlSystem.controllers.length > 0 || state.controlSystem.actuators.length > 0) ? state.controlSystem : undefined,
      transient: state.species.length > 0 ? state.transientConfig : undefined,
      weather: state.weatherConfig.enabled ? state.weatherConfig : undefined,
      ahsSystems: state.ahsSystems.length > 0 ? state.ahsSystems : undefined,
    };
  },

  loadFromJson: (json: TopologyJson) => set(() => {
    const SPACING_X = 180;
    const SPACING_Y = 120;
    const START_X = 80;
    const START_Y = 80;

    const nodes: ZoneNode[] = json.nodes.map((n, i) => ({
      id: n.id,
      name: n.name,
      type: (n.type as ZoneNode['type']) || 'normal',
      temperature: n.temperature ?? 293.15,
      elevation: n.elevation ?? 0,
      volume: n.volume ?? 50,
      pressure: n.pressure ?? 0,
      x: START_X + (i % 4) * SPACING_X,
      y: START_Y + Math.floor(i / 4) * SPACING_Y,
      width: 120,
      height: 80,
    }));

    const links: AirflowLink[] = json.links.map((l) => {
      const fromNode = nodes.find((n) => n.id === l.from);
      const toNode = nodes.find((n) => n.id === l.to);
      const elem = typeof l.element === 'string'
        ? (json.flowElements?.[l.element] ?? { type: 'PowerLawOrifice' as const, C: 0.001, n: 0.65 })
        : (l.element ?? { type: 'PowerLawOrifice' as const, C: 0.001, n: 0.65 });
      return {
        id: l.id,
        from: l.from,
        to: l.to,
        elevation: l.elevation ?? 1.5,
        element: elem,
        x: fromNode && toNode ? (fromNode.x + toNode.x) / 2 : 0,
        y: fromNode && toNode ? (fromNode.y + toNode.y) / 2 : 0,
      };
    });

    const maxId = Math.max(0, ...nodes.map((n) => n.id), ...links.map((l) => l.id));

    return {
      nodes,
      links,
      ambientTemperature: json.ambient?.temperature ?? 283.15,
      ambientPressure: json.ambient?.pressure ?? 0,
      windSpeed: json.ambient?.windSpeed ?? 0,
      windDirection: json.ambient?.windDirection ?? 0,
      selectedNodeId: null,
      selectedLinkId: null,
      species: json.species ?? [],
      sources: json.sources ?? [],
      schedules: json.schedules ?? [],
      occupants: json.occupants ?? [],
      controlSystem: json.controls ?? { sensors: [], controllers: [], actuators: [] },
      transientConfig: json.transient ?? { startTime: 0, endTime: 3600, timeStep: 60, outputInterval: 60 },
      weatherConfig: json.weather ?? { enabled: false, filePath: '', records: [] },
      ahsSystems: json.ahsSystems ?? [],
      filterConfigs: [],
      result: null,
      transientResult: null,
      error: null,
      nextId: maxId + 1,
    };
  }),

  clearAll: () => set({
    nodes: [],
    links: [],
    species: [],
    sources: [],
    schedules: [],
    occupants: [],
    controlSystem: { sensors: [], controllers: [], actuators: [] },
    selectedNodeId: null,
    selectedLinkId: null,
    weatherConfig: { enabled: false, filePath: '', records: [] },
    ahsSystems: [],
    filterConfigs: [],
    result: null,
    transientResult: null,
    error: null,
    nextId: 1,
  }),
}), { limit: 50 }));
