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
  level?: number;        // floor level (0=ground, 1=first floor, etc.)
  isShaft?: boolean;     // true = stairwell/elevator shaft spanning multiple floors
  // Canvas position (UI only)
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Flow Element ─────────────────────────────────────────────────────
export type FlowElementType = 'PowerLawOrifice' | 'TwoWayFlow' | 'Fan' | 'Duct' | 'Damper' | 'Filter' | 'SelfRegulatingVent' | 'CheckValve' | 'SupplyDiffuser' | 'ReturnGrille';

export interface FlowElementDef {
  type: FlowElementType;
  C?: number;            // flow coefficient (PowerLawOrifice)
  n?: number;            // flow exponent (PowerLawOrifice)
  Cd?: number;           // discharge coefficient (TwoWayFlow)
  area?: number;         // opening area m² (TwoWayFlow)
  maxFlow?: number;      // max volumetric flow m³/s (Fan)
  shutoffPressure?: number; // shutoff pressure Pa (Fan)
  length?: number;         // duct length m (Duct)
  diameter?: number;       // hydraulic diameter m (Duct)
  roughness?: number;      // surface roughness m (Duct)
  sumK?: number;           // minor loss coefficients (Duct)
  Cmax?: number;           // max flow coefficient (Damper)
  fraction?: number;       // opening fraction 0-1 (Damper)
  efficiency?: number;     // removal efficiency 0-1 (Filter)
  targetFlow?: number;     // target volumetric flow m³/s (SelfRegulatingVent)
  pMin?: number;           // min regulation pressure Pa (SelfRegulatingVent)
  pMax?: number;           // max regulation pressure Pa (SelfRegulatingVent)
  height?: number;         // opening height m (TwoWayFlow)
  coeffs?: number[];       // polynomial coefficients (Fan)
}

// ── Link (Airflow Path) ──────────────────────────────────────────────
export interface AirflowLink {
  id: number;
  from: number;      // node ID
  to: number;        // node ID
  elevation: number; // m
  element: FlowElementDef;
  scheduleId?: number; // bound schedule ID (-1 or undefined = no schedule)
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
  isTrace: boolean;
  diffusionCoeff: number;
  meanDiameter: number;
  effectiveDensity: number;
}

export type SourceType = 'Constant' | 'ExponentialDecay' | 'PressureDriven' | 'CutoffConcentration' | 'Burst';

export interface Source {
  zoneId: number;
  speciesId: number;
  generationRate: number;
  removalRate: number;
  scheduleId: number;
  type?: SourceType;
  decayTimeConstant?: number;  // τ_c seconds (ExponentialDecay)
  startTime?: number;          // activation time (ExponentialDecay)
  multiplier?: number;         // scaling factor (ExponentialDecay)
  pressureCoeff?: number;      // kg/(s·Pa) (PressureDriven)
  cutoffConc?: number;         // kg/m³ threshold (CutoffConcentration)
  burstMass?: number;          // kg total release (Burst)
  burstTime?: number;          // activation time seconds (Burst)
  burstDuration?: number;      // release duration seconds (Burst)
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

// ── Week Schedule / Day Type ────────────────────────────────────────
export interface DayType {
  id: number;
  name: string;           // e.g. "工作日", "周末", "假日"
  scheduleId: number;     // references a Schedule
}

export interface WeekSchedule {
  id: number;
  name: string;
  dayTypes: number[];     // 7 DayType IDs, index 0=Monday ... 6=Sunday
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
  occupants?: Occupant[];
  controls?: ControlSystem;
  transient?: TransientConfig;
  weather?: WeatherConfig;
  ahsSystems?: AHSConfig[];
}

// ── Occupant ────────────────────────────────────────────────────────
export interface OccupantZoneAssignment {
  startTime: number;  // seconds
  endTime: number;    // seconds
  zoneId: number;     // node ID (-1 = outside building)
}

export interface Occupant {
  id: number;
  name: string;
  breathingRate: number;  // m³/s
  co2EmissionRate: number; // kg/s (exhaled CO2)
  schedule: OccupantZoneAssignment[];
}

// ── Control System ───────────────────────────────────────────────
export interface SensorDef {
  id: number;
  name: string;
  type: 'Concentration' | 'Pressure' | 'Temperature' | 'MassFlow';
  targetId: number;
  speciesIdx: number;
}

export interface ControllerDef {
  id: number;
  name: string;
  sensorId: number;
  actuatorId: number;
  setpoint: number;
  Kp: number;
  Ki: number;
  deadband: number;
}

export interface ActuatorDef {
  id: number;
  name: string;
  type: 'DamperFraction' | 'FanSpeed' | 'FilterBypass';
  linkIdx: number;
}

export interface ControlSystem {
  sensors: SensorDef[];
  controllers: ControllerDef[];
  actuators: ActuatorDef[];
}

// ── Weather ─────────────────────────────────────────────────────────
export interface WeatherRecord {
  month: number;
  day: number;
  hour: number;
  temperature: number;   // K
  windSpeed: number;     // m/s
  windDirection: number; // degrees (0=N, 90=E)
  pressure: number;      // Pa (absolute)
  humidity: number;      // 0~1
}

export interface WeatherConfig {
  enabled: boolean;
  filePath: string;       // .wth file path (empty = not loaded)
  records: WeatherRecord[];
}

// ── Air Handling System ─────────────────────────────────────────────
export interface AHSZoneConnection {
  zoneId: number;
  fraction: number; // 0~1, fraction of total flow to this zone
}

export interface AHSConfig {
  id: number;
  name: string;
  supplyFlow: number;       // m³/s
  returnFlow: number;       // m³/s
  outdoorAirFlow: number;   // m³/s
  exhaustFlow: number;      // m³/s
  supplyTemperature: number; // K
  supplyZones: AHSZoneConnection[];
  returnZones: AHSZoneConnection[];
  outdoorAirScheduleId: number;  // -1 = constant
  supplyFlowScheduleId: number;  // -1 = constant
}

// ── Filter Configuration ──────────────────────────────────────────
export interface LoadingPoint {
  loading: number;     // cumulative mass captured (kg)
  efficiency: number;  // removal efficiency at this loading (0~1)
}

export interface SimpleGaseousFilterConfig {
  id: number;
  name: string;
  type: 'SimpleGaseousFilter';
  flowCoefficient: number;    // C (power-law)
  flowExponent: number;       // n (power-law)
  loadingTable: LoadingPoint[];
  breakthroughThreshold: number;  // default 0.05
}

export interface UVGIFilterConfig {
  id: number;
  name: string;
  type: 'UVGIFilter';
  flowCoefficient: number;
  flowExponent: number;
  susceptibility: number;      // k (m²/J)
  irradiance: number;          // UV irradiance (W/m²)
  chamberVolume: number;       // m³
  tempCoeffs: number[];        // polynomial [a0, a1, a2, a3]
  flowCoeffs: number[];        // polynomial [b0, b1, b2]
  agingRate: number;           // degradation per hour
  lampAgeHours: number;        // current lamp age
}

export interface SuperFilterConfig {
  id: number;
  name: string;
  type: 'SuperFilter';
  stages: Array<{
    filterType: 'SimpleGaseousFilter' | 'UVGIFilter' | 'Filter';
    filterId: number;  // reference to another filter config
  }>;
  loadingDecayRate: number;  // exponential decay between stages
}

export type FilterConfig = SimpleGaseousFilterConfig | UVGIFilterConfig | SuperFilterConfig;

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
  weekSchedules: WeekSchedule[];
  dayTypes: DayType[];
  occupants: Occupant[];
  controlSystem: ControlSystem;
  transientConfig: TransientConfig;

  // Weather & AHS
  weatherConfig: WeatherConfig;
  ahsSystems: AHSConfig[];
  filterConfigs: FilterConfig[];

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
  updateSchedule: (id: number, updates: Partial<Schedule>) => void;
  removeSchedule: (id: number) => void;
  addWeekSchedule: (ws: WeekSchedule) => void;
  updateWeekSchedule: (id: number, updates: Partial<WeekSchedule>) => void;
  removeWeekSchedule: (id: number) => void;
  addDayType: (dt: DayType) => void;
  updateDayType: (id: number, updates: Partial<DayType>) => void;
  removeDayType: (id: number) => void;
  addOccupant: (occ: Occupant) => void;
  removeOccupant: (id: number) => void;
  updateOccupant: (id: number, updates: Partial<Occupant>) => void;
  setControlSystem: (cs: ControlSystem) => void;
  setTransientConfig: (config: Partial<TransientConfig>) => void;
  setTransientResult: (result: TransientResult | null) => void;
  setWeatherConfig: (config: Partial<WeatherConfig>) => void;
  addAHS: (ahs: AHSConfig) => void;
  updateAHS: (id: number, updates: Partial<AHSConfig>) => void;
  removeAHS: (id: number) => void;
  addFilterConfig: (fc: FilterConfig) => void;
  updateFilterConfig: (id: number, updates: Partial<FilterConfig>) => void;
  removeFilterConfig: (id: number) => void;
  exportTopology: () => TopologyJson;
  loadFromJson: (json: TopologyJson) => void;
  clearAll: () => void;
}
