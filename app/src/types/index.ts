// ── Node (Zone/Room) ─────────────────────────────────────────────────
export type NodeType = 'normal' | 'ambient' | 'phantom' | 'cfd';

export interface ZoneNode {
  id: number;
  name: string;
  type: NodeType;
  temperature: number;   // K
  elevation: number;     // m
  volume: number;        // m³
  pressure: number;      // Pa (gauge)
  // Canvas position (UI only)
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Flow Element ─────────────────────────────────────────────────────
export type FlowElementType = 'PowerLawOrifice' | 'LargeOpening' | 'Fan' | 'Duct' | 'Damper';

export interface FlowElementDef {
  type: FlowElementType;
  C?: number;   // flow coefficient
  n?: number;   // flow exponent
}

// ── Link (Airflow Path) ──────────────────────────────────────────────
export interface AirflowLink {
  id: number;
  from: number;      // node ID
  to: number;        // node ID
  elevation: number; // m
  element: FlowElementDef;
  // Canvas position for the link icon
  x: number;
  y: number;
}

// ── Solver Results ───────────────────────────────────────────────────
export interface SolverInfo {
  converged: boolean;
  iterations: number;
  maxResidual: number;
}

export interface NodeResult {
  id: number;
  name: string;
  pressure: number;
  density: number;
  temperature: number;
  elevation: number;
}

export interface LinkResult {
  id: number;
  from: number;
  to: number;
  massFlow: number;
  volumeFlow_m3s: number;
}

export interface SimulationResult {
  solver: SolverInfo;
  nodes: NodeResult[];
  links: LinkResult[];
}

// ── Species / Source / Schedule ──────────────────────────────────────
export interface Species {
  id: number;
  name: string;
  molarMass: number;
  decayRate: number;
  outdoorConcentration: number;
}

export interface Source {
  zoneId: number;
  speciesId: number;
  generationRate: number;
  removalRate: number;
  scheduleId: number;
}

export interface SchedulePoint {
  time: number;
  value: number;
}

export interface Schedule {
  id: number;
  name: string;
  points: SchedulePoint[];
}

export interface TransientConfig {
  startTime: number;
  endTime: number;
  timeStep: number;
  outputInterval: number;
}

// ── Transient Result ────────────────────────────────────────────────
export interface TransientTimeStep {
  time: number;
  airflow: { converged: boolean; iterations: number; pressures: number[]; massFlows: number[] };
  concentrations: number[][];  // [nodeIdx][speciesIdx]
}

export interface TransientResult {
  completed: boolean;
  totalSteps: number;
  species: { id: number; name: string; molarMass: number }[];
  nodes: { id: number; name: string; type: string }[];
  timeSeries: TransientTimeStep[];
}

// ── Topology JSON (matches engine schema) ────────────────────────────
export interface TopologyJson {
  description?: string;
  ambient?: {
    temperature: number;
    pressure: number;
    windSpeed: number;
    windDirection: number;
  };
  flowElements?: Record<string, FlowElementDef>;
  nodes: Array<{
    id: number;
    name: string;
    type: string;
    temperature?: number;
    elevation?: number;
    volume?: number;
    pressure?: number;
  }>;
  links: Array<{
    id: number;
    from: number;
    to: number;
    elevation?: number;
    element: string | FlowElementDef;
  }>;
  species?: Species[];
  sources?: Source[];
  schedules?: Schedule[];
  transient?: TransientConfig;
}

// ── UI State ─────────────────────────────────────────────────────────
export type ToolMode = 'select' | 'addRoom' | 'addAmbient' | 'addLink';

export interface AppState {
  // Model data
  nodes: ZoneNode[];
  links: AirflowLink[];
  ambientTemperature: number;
  ambientPressure: number;
  windSpeed: number;
  windDirection: number;

  // UI state
  selectedNodeId: number | null;
  selectedLinkId: number | null;
  toolMode: ToolMode;
  nextId: number;

  // Contaminant model
  species: Species[];
  sources: Source[];
  schedules: Schedule[];
  transientConfig: TransientConfig;

  // Simulation
  result: SimulationResult | null;
  transientResult: TransientResult | null;
  isRunning: boolean;
  error: string | null;

  // Actions
  addNode: (node: Partial<ZoneNode>) => void;
  updateNode: (id: number, updates: Partial<ZoneNode>) => void;
  removeNode: (id: number) => void;
  addLink: (link: Partial<AirflowLink>) => void;
  updateLink: (id: number, updates: Partial<AirflowLink>) => void;
  removeLink: (id: number) => void;
  selectNode: (id: number | null) => void;
  selectLink: (id: number | null) => void;
  setToolMode: (mode: ToolMode) => void;
  setAmbient: (updates: Partial<{ ambientTemperature: number; ambientPressure: number; windSpeed: number; windDirection: number }>) => void;
  setResult: (result: SimulationResult | null) => void;
  setIsRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  addSpecies: (sp: Species) => void;
  removeSpecies: (id: number) => void;
  updateSpecies: (id: number, updates: Partial<Species>) => void;
  addSource: (src: Source) => void;
  removeSource: (idx: number) => void;
  updateSource: (idx: number, updates: Partial<Source>) => void;
  addSchedule: (sch: Schedule) => void;
  setTransientConfig: (config: Partial<TransientConfig>) => void;
  setTransientResult: (result: TransientResult | null) => void;
  exportTopology: () => TopologyJson;
  loadFromJson: (json: TopologyJson) => void;
  clearAll: () => void;
}
