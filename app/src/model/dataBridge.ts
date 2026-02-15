/**
 * Data Bridge: converts canvas geometry (Vertex→Edge→Face) into engine topology JSON.
 * This is the critical link between the 2.5D visual editor and the C++ simulation engine.
 */

import { faceArea, getEdge } from './geometry';
import type { TopologyJson, FlowElementDef } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '../store/useAppStore';

/**
 * Placement type → default flow element definition mapping
 */
const PLACEMENT_TO_ELEMENT: Record<string, () => FlowElementDef> = {
  door: () => ({ type: 'TwoWayFlow', Cd: 0.65, area: 1.8, height: 2.0 }),
  window: () => ({ type: 'PowerLawOrifice', C: 0.001, n: 0.65 }),
  opening: () => ({ type: 'PowerLawOrifice', C: 0.005, n: 0.65 }),
  fan: () => ({ type: 'Fan', maxFlow: 0.05, shutoffPressure: 200 }),
  duct: () => ({ type: 'Duct', length: 5.0, diameter: 0.2, roughness: 0.0001, sumK: 0 }),
  damper: () => ({ type: 'Damper', Cmax: 0.005, n: 0.65, fraction: 1.0 }),
  filter: () => ({ type: 'Filter', C: 0.002, n: 0.65, efficiency: 0.9 }),
  crack: () => ({ type: 'PowerLawOrifice', C: 0.0001, n: 0.65 }),
  srv: () => ({ type: 'SelfRegulatingVent', targetFlow: 0.01, pMin: 2.0, pMax: 50.0 }),
  checkValve: () => ({ type: 'CheckValve', C: 0.001, n: 0.65 }),
};

/**
 * Convert all stories in the canvas to an engine-compatible TopologyJson.
 * This merges the geometry-based zones and placements with the existing
 * contaminant/schedule/control data from the old AppStore.
 */
export function canvasToTopology(): TopologyJson {
  const canvasState = useCanvasStore.getState();
  const appState = useAppStore.getState();

  // Fallback: if canvas has no zones, use legacy AppStore topology
  const hasCanvasZones = canvasState.stories.some(s => s.geometry.faces.length > 0);
  if (!hasCanvasZones && appState.nodes.length > 0) {
    return appState.exportTopology();
  }

  const allNodes: TopologyJson['nodes'] = [];
  const allLinks: TopologyJson['links'] = [];
  let nextLinkId = 10000;

  // Add an ambient node (ID=0) representing the outdoor environment
  allNodes.push({
    id: 0,
    name: '室外',
    type: 'ambient',
    temperature: appState.ambientTemperature,
    elevation: 0,
    volume: 0,
    pressure: appState.ambientPressure,
  });

  // Process each story
  for (const story of canvasState.stories) {
    const geo = story.geometry;

    // Convert zone assignments to nodes
    for (const zone of story.zoneAssignments) {
      const face = geo.faces.find(f => f.id === zone.faceId);
      if (!face) continue;

      const area = faceArea(geo, face);
      const volume = area * story.floorToCeilingHeight;

      allNodes.push({
        id: zone.zoneId,
        name: zone.name,
        type: 'normal',
        temperature: zone.temperature,
        elevation: story.level * story.floorToCeilingHeight,
        volume: volume,
        pressure: 0,
      });
    }

    // Convert placements to links
    for (const placement of story.placements) {
      const edge = getEdge(geo, placement.edgeId);
      if (!edge) continue;

      // Determine which zones are on each side of the wall
      const faceIds = edge.faceIds;
      let fromZoneId: number;
      let toZoneId: number;

      if (faceIds.length === 2) {
        // Internal wall: connects two zones
        const z1 = story.zoneAssignments.find(z => z.faceId === faceIds[0]);
        const z2 = story.zoneAssignments.find(z => z.faceId === faceIds[1]);
        fromZoneId = z1?.zoneId ?? 0;
        toZoneId = z2?.zoneId ?? 0;
      } else if (faceIds.length === 1) {
        // Exterior wall: connects zone to ambient (ID=0)
        const z1 = story.zoneAssignments.find(z => z.faceId === faceIds[0]);
        fromZoneId = z1?.zoneId ?? 0;
        toZoneId = 0; // ambient
      } else {
        // No faces on either side (orphan wall) — skip
        continue;
      }

      if (fromZoneId === toZoneId) continue;

      // Create flow element from placement type
      const elementFactory = PLACEMENT_TO_ELEMENT[placement.type];
      const element: FlowElementDef = elementFactory
        ? elementFactory()
        : { type: 'PowerLawOrifice', C: 0.001, n: 0.65 };

      // Calculate elevation from story level + half wall height
      const linkElevation = story.level * story.floorToCeilingHeight + story.floorToCeilingHeight * 0.5;

      allLinks.push({
        id: nextLinkId++,
        from: fromZoneId,
        to: toZoneId,
        elevation: linkElevation,
        element,
      });
    }
  }

  // Build final topology JSON, merging with existing contaminant/control data
  const topology: TopologyJson = {
    description: 'CONTAM-Next 2.5D model',
    ambient: {
      temperature: appState.ambientTemperature,
      pressure: appState.ambientPressure,
      windSpeed: appState.windSpeed,
      windDirection: appState.windDirection,
    },
    nodes: allNodes,
    links: allLinks,
  };

  // Merge species, sources, schedules, occupants, controls from AppStore
  if (appState.species.length > 0) topology.species = appState.species;
  if (appState.sources.length > 0) topology.sources = appState.sources;
  if (appState.schedules.length > 0) topology.schedules = appState.schedules;
  if (appState.occupants.length > 0) topology.occupants = appState.occupants;

  const cs = appState.controlSystem;
  if (cs.sensors.length > 0 || cs.controllers.length > 0 || cs.actuators.length > 0) {
    topology.controls = cs;
  }

  if (appState.species.length > 0) {
    topology.transient = appState.transientConfig;
  }

  if (appState.weatherConfig.enabled) {
    topology.weather = appState.weatherConfig;
  }
  if (appState.ahsSystems.length > 0) {
    topology.ahsSystems = appState.ahsSystems;
  }

  return topology;
}

/**
 * Export steady-state results as CSV string.
 */
export function steadyResultToCSV(): string {
  const appState = useAppStore.getState();
  const result = appState.result;
  if (!result) return '';

  const lines: string[] = [];

  // Nodes
  lines.push('# Node Results');
  lines.push('ID,Name,Pressure(Pa),Density(kg/m³),Temperature(K),Elevation(m)');
  for (const n of result.nodes) {
    lines.push(`${n.id},${n.name},${n.pressure.toFixed(6)},${n.density.toFixed(6)},${n.temperature.toFixed(2)},${n.elevation.toFixed(2)}`);
  }
  lines.push('');

  // Links
  lines.push('# Link Results');
  lines.push('ID,From,To,MassFlow(kg/s),VolumeFlow(m³/s)');
  for (const l of result.links) {
    lines.push(`${l.id},${l.from},${l.to},${l.massFlow.toFixed(8)},${l.volumeFlow_m3s.toFixed(8)}`);
  }

  return lines.join('\n');
}

/**
 * Export transient results as CSV string.
 */
export function transientResultToCSV(): string {
  const appState = useAppStore.getState();
  const tr = appState.transientResult;
  if (!tr) return '';

  const lines: string[] = [];

  // Header
  const speciesNames = tr.species.map(s => s.name);
  const headers = ['Time(s)'];

  // Pressure columns
  for (const n of tr.nodes) {
    if (n.type !== 'ambient') headers.push(`P_${n.name}(Pa)`);
  }

  // Concentration columns: [node x species]
  for (const n of tr.nodes) {
    if (n.type === 'ambient') continue;
    for (const sp of speciesNames) {
      headers.push(`C_${n.name}_${sp}(kg/m³)`);
    }
  }

  lines.push(headers.join(','));

  // Data rows
  for (const step of tr.timeSeries) {
    const row: string[] = [step.time.toFixed(1)];

    // Pressures
    const nonAmbientIndices = tr.nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.type !== 'ambient');

    for (const { i } of nonAmbientIndices) {
      row.push((step.airflow.pressures[i] ?? 0).toFixed(6));
    }

    // Concentrations
    for (const { i } of nonAmbientIndices) {
      for (let s = 0; s < speciesNames.length; s++) {
        const conc = step.concentrations[i]?.[s] ?? 0;
        row.push(conc.toExponential(6));
      }
    }

    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Download a string as a file in the browser.
 */
export function downloadAsFile(content: string, filename: string, mimeType: string = 'text/csv'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate the canvas model before simulation.
 * Returns { errors, warnings }. Errors block simulation, warnings don't.
 */
export function validateModel(): { errors: string[]; warnings: string[] } {
  const canvasState = useCanvasStore.getState();
  const appState = useAppStore.getState();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Allow legacy mode: if old AppStore has nodes, skip canvas validation
  const hasCanvasZones = canvasState.stories.some(s => s.geometry.faces.length > 0);
  const hasLegacyNodes = appState.nodes.length > 0;

  if (!hasCanvasZones && !hasLegacyNodes) {
    errors.push('模型为空：请先画墙围合区域，或加载已有模型文件');
    return { errors, warnings };
  }

  // If using legacy nodes only, no further canvas validation needed
  if (!hasCanvasZones && hasLegacyNodes) {
    return { errors, warnings };
  }

  for (const story of canvasState.stories) {
    // Unconfigured placements are warnings, not errors
    for (const placement of story.placements) {
      if (!placement.isConfigured) {
        warnings.push(`楼层 "${story.name}": 组件 "${placement.type}" 尚未配置（使用默认参数）`);
      }
    }

    // Isolated zones are warnings
    for (const zone of story.zoneAssignments) {
      const face = story.geometry.faces.find(f => f.id === zone.faceId);
      if (!face) continue;

      const edgeIds = face.edgeIds;
      const hasPlacement = story.placements.some(p => edgeIds.includes(p.edgeId));
      if (!hasPlacement) {
        warnings.push(`区域 "${zone.name}": 没有气流路径，将与其他区域隔绝`);
      }
    }
  }

  return { errors, warnings };
}
