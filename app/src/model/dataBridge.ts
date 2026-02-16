/**
 * Data Bridge: converts canvas geometry (Vertex→Edge→Face) into engine topology JSON.
 * This is the critical link between the 2.5D visual editor and the C++ simulation engine.
 */

import { faceArea, getEdge, edgeLength } from './geometry';
import type { TopologyJson, FlowElementDef } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '../store/useAppStore';

/**
 * Placement type → default flow element definition mapping
 */
const PLACEMENT_DEFAULTS: Record<string, () => FlowElementDef> = {
  door: () => ({ type: 'TwoWayFlow', Cd: 0.65, area: 1.8, height: 2.0 }),
  window: () => ({ type: 'PowerLawOrifice', C: 0.001, n: 0.65 }),
  opening: () => ({ type: 'TwoWayFlow', Cd: 0.65, area: 0.5, height: 2.0 }),
  fan: () => ({ type: 'Fan', maxFlow: 0.05, shutoffPressure: 200 }),
  duct: () => ({ type: 'Duct', length: 5.0, diameter: 0.2, roughness: 0.0001, sumK: 0 }),
  damper: () => ({ type: 'Damper', Cmax: 0.005, n: 0.65, fraction: 1.0 }),
  filter: () => ({ type: 'Filter', C: 0.002, n: 0.65, efficiency: 0.9 }),
  crack: () => ({ type: 'PowerLawOrifice', C: 0.0001, n: 0.65 }),
  srv: () => ({ type: 'SelfRegulatingVent', targetFlow: 0.01, pMin: 2.0, pMax: 50.0 }),
  checkValve: () => ({ type: 'CheckValve', C: 0.001, n: 0.65 }),
};

/**
 * Build a FlowElementDef from placement user-configured parameters.
 * Falls back to defaults when placement is not configured.
 * C-01: Ensures user-edited parameters are passed to the engine.
 * C-02/C-04: door/opening both map to TwoWayFlow with correct params.
 */
function buildElementFromPlacement(placement: import('./geometry').EdgePlacement): FlowElementDef {
  const defaults = PLACEMENT_DEFAULTS[placement.type];
  const base: FlowElementDef = defaults ? defaults() : { type: 'PowerLawOrifice', C: 0.001, n: 0.65 };

  if (!placement.isConfigured) return base;

  switch (placement.type) {
    case 'door':
      return {
        type: 'TwoWayFlow',
        Cd: placement.dischargeCd ?? base.Cd ?? 0.65,
        area: placement.openingArea ?? base.area ?? 1.8,
        height: placement.openingHeight ?? base.height ?? 2.0,
      };
    case 'opening':
      return {
        type: 'TwoWayFlow',
        Cd: placement.dischargeCd ?? base.Cd ?? 0.65,
        area: placement.openingArea ?? base.area ?? 0.5,
        height: placement.openingHeight ?? base.height ?? 2.0,
      };
    case 'window':
    case 'crack':
      return {
        type: 'PowerLawOrifice',
        C: placement.flowCoefficient ?? base.C,
        n: placement.flowExponent ?? base.n,
      };
    case 'fan':
      return {
        type: 'Fan',
        maxFlow: placement.maxFlow ?? base.maxFlow,
        shutoffPressure: placement.shutoffPressure ?? base.shutoffPressure,
      };
    case 'duct':
      return {
        type: 'Duct',
        length: base.length, // overridden by edge length later
        diameter: placement.ductDiameter ?? base.diameter ?? 0.2,
        roughness: placement.ductRoughness ?? base.roughness ?? 0.0001,
        sumK: placement.ductSumK ?? base.sumK ?? 0,
      };
    case 'damper':
      return {
        type: 'Damper',
        Cmax: placement.flowCoefficient ?? base.Cmax ?? 0.005,
        n: placement.flowExponent ?? base.n ?? 0.65,
        fraction: placement.damperFraction ?? base.fraction ?? 1.0,
      };
    case 'filter':
      return {
        type: 'Filter',
        C: placement.flowCoefficient ?? base.C ?? 0.002,
        n: placement.flowExponent ?? base.n ?? 0.65,
        efficiency: placement.filterEfficiency ?? base.efficiency ?? 0.9,
      };
    case 'srv':
      return {
        type: 'SelfRegulatingVent',
        targetFlow: placement.targetFlow ?? base.targetFlow,
        pMin: placement.pMin ?? base.pMin,
        pMax: placement.pMax ?? base.pMax,
      };
    case 'checkValve':
      return {
        type: 'CheckValve',
        C: placement.flowCoefficient ?? base.C ?? 0.001,
        n: placement.flowExponent ?? base.n ?? 0.65,
      };
    default:
      return base;
  }
}

/**
 * Convert all stories in the canvas to an engine-compatible TopologyJson.
 * This merges the geometry-based zones and placements with the existing
 * contaminant/schedule/control data from the old AppStore.
 *
 * scaleFactor is applied to convert grid units to physical meters:
 *   - lengths (wall height, duct length, elevation) *= scaleFactor
 *   - areas (face area, opening area) *= scaleFactor^2
 *   - volumes *= scaleFactor^3
 */
export function canvasToTopology(): TopologyJson {
  const canvasState = useCanvasStore.getState();
  const appState = useAppStore.getState();
  const sf = canvasState.scaleFactor;
  const sf2 = sf * sf;
  const sf3 = sf * sf * sf;

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

      const area = faceArea(geo, face) * sf2;
      // M-01: Respect user-edited volume; only auto-calculate if volume is 0 or unset
      const volume = zone.volume > 0 ? zone.volume * sf3 : area * story.floorToCeilingHeight * sf;
      // M-05: Use explicit elevation if set, otherwise calculate from level
      const elevation = story.elevation != null
        ? story.elevation * sf
        : story.level * story.floorToCeilingHeight * sf;

      const nodeData: any = {
        id: zone.zoneId,
        name: zone.name,
        type: 'normal',
        temperature: zone.temperature,
        elevation,
        volume,
        pressure: 0,
      };
      // H-07: Pass initial concentrations if set
      if (zone.initialConcentrations && Object.keys(zone.initialConcentrations).length > 0) {
        nodeData.initialConcentrations = zone.initialConcentrations;
      }
      allNodes.push(nodeData);
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

      // C-01: Build element from user-configured placement parameters
      const element: FlowElementDef = buildElementFromPlacement(placement);

      // Apply scale factor to geometry-dependent element properties
      if (element.area !== undefined) element.area *= sf2;
      if (element.height !== undefined) element.height *= sf;
      if (element.length !== undefined) {
        // For ducts, use actual edge length scaled
        const len = edgeLength(geo, edge);
        element.length = len * sf;
      }

      // Calculate elevation from story level + half wall height
      // M-05: Link elevation uses story elevation override if available
      const storyBase = story.elevation != null
        ? story.elevation * sf
        : story.level * story.floorToCeilingHeight * sf;
      const linkElevation = storyBase + story.floorToCeilingHeight * 0.5 * sf;

      allLinks.push({
        id: nextLinkId++,
        from: fromZoneId,
        to: toZoneId,
        elevation: linkElevation,
        element,
      });
    }
  }

  // C-03: Generate cross-floor links for shaft groups
  const shaftGroups = new Map<string, Array<{ zoneId: number; level: number; elevation: number }>>();
  for (const story of canvasState.stories) {
    const storyElev = story.elevation != null
      ? story.elevation * sf
      : story.level * story.floorToCeilingHeight * sf;
    for (const zone of story.zoneAssignments) {
      if (zone.shaftGroupId) {
        if (!shaftGroups.has(zone.shaftGroupId)) shaftGroups.set(zone.shaftGroupId, []);
        shaftGroups.get(zone.shaftGroupId)!.push({
          zoneId: zone.zoneId,
          level: story.level,
          elevation: storyElev,
        });
      }
    }
  }
  for (const [, zones] of shaftGroups) {
    if (zones.length < 2) continue;
    zones.sort((a, b) => a.level - b.level);
    for (let i = 0; i < zones.length - 1; i++) {
      const lower = zones[i];
      const upper = zones[i + 1];
      allLinks.push({
        id: nextLinkId++,
        from: lower.zoneId,
        to: upper.zoneId,
        elevation: (lower.elevation + upper.elevation) / 2,
        element: { type: 'TwoWayFlow', Cd: 0.65, area: 2.0, height: 3.0 },
      });
    }
  }

  // Build final topology JSON, merging with existing contaminant/control data
  const topology: TopologyJson = {
    description: 'CONTAM-Next 2D model',
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

  // Collect all zone IDs for duplicate check
  const allZoneIds = new Set<number>();

  for (const story of canvasState.stories) {
    // Check story has valid height
    if (story.floorToCeilingHeight <= 0) {
      errors.push(`楼层 "${story.name}": 层高必须大于 0`);
    }

    // Check for zones with zero area
    for (const zone of story.zoneAssignments) {
      const face = story.geometry.faces.find(f => f.id === zone.faceId);
      if (!face) continue;

      const area = faceArea(story.geometry, face);
      if (area < 1e-6) {
        warnings.push(`楼层 "${story.name}": 区域 "${zone.name}" 面积接近零`);
      }

      // Duplicate zone ID check
      if (allZoneIds.has(zone.zoneId)) {
        errors.push(`楼层 "${story.name}": 区域 "${zone.name}" 的 ID ${zone.zoneId} 重复`);
      }
      allZoneIds.add(zone.zoneId);

      // Temperature sanity check
      if (zone.temperature < 200 || zone.temperature > 400) {
        warnings.push(`区域 "${zone.name}": 温度 ${zone.temperature}K 超出常规范围 (200~400K)`);
      }
    }

    // Unconfigured placements are warnings, not errors
    for (const placement of story.placements) {
      if (!placement.isConfigured) {
        warnings.push(`楼层 "${story.name}": 组件 "${placement.type}" 尚未配置（使用默认参数）`);
      }
      // L-14: Warn about placements on orphan walls (no adjacent zones)
      const edge = story.geometry.edges.find(e => e.id === placement.edgeId);
      if (edge && edge.faceIds.length === 0) {
        warnings.push(`楼层 "${story.name}": 孤立墙上的构件 "${placement.type}" 将被忽略`);
      }
    }

    // Isolated zones are warnings
    for (const zone of story.zoneAssignments) {
      const face = story.geometry.faces.find(f => f.id === zone.faceId);
      if (!face) continue;

      const edgeIds = face.edgeIds;
      const hasPlacement = story.placements.some(p => edgeIds.includes(p.edgeId));
      const hasShaft = !!zone.shaftGroupId;
      if (!hasPlacement && !hasShaft) {
        warnings.push(`区域 "${zone.name}": 没有气流路径，将与其他区域隔绝`);
      }
    }

    // Adjacent story outline check: warn if multi-story but no vertical connections
    if (canvasState.stories.length > 1) {
      const hasShafts = story.zoneAssignments.some(z => z.shaftGroupId);
      if (!hasShafts) {
        warnings.push(`楼层 "${story.name}": 多楼层模型中未设置竖井连通`);
      }
    }
  }

  // Species/source consistency
  if (appState.sources.length > 0 && appState.species.length === 0) {
    errors.push('已定义污染源但未定义污染物种类');
  }
  for (const src of appState.sources) {
    if (!appState.species.find(sp => sp.id === src.speciesId)) {
      warnings.push(`污染源引用了不存在的物种 ID: ${src.speciesId}`);
    }
    // Schedule reference integrity
    if (src.scheduleId && !appState.schedules.find(s => s.id === src.scheduleId)) {
      warnings.push(`污染源引用了不存在的时间表 ID: ${src.scheduleId}`);
    }
  }

  // AHS schedule reference integrity
  for (const ahs of appState.ahsSystems ?? []) {
    if (ahs.outdoorAirScheduleId && ahs.outdoorAirScheduleId !== -1 && !appState.schedules.find(s => s.id === ahs.outdoorAirScheduleId)) {
      warnings.push(`AHS "${ahs.name}" 引用了不存在的室外空气时间表 ID: ${ahs.outdoorAirScheduleId}`);
    }
    if (ahs.supplyFlowScheduleId && ahs.supplyFlowScheduleId !== -1 && !appState.schedules.find(s => s.id === ahs.supplyFlowScheduleId)) {
      warnings.push(`AHS "${ahs.name}" 引用了不存在的送风时间表 ID: ${ahs.supplyFlowScheduleId}`);
    }
  }

  // Volume sanity check across all zones
  for (const story of canvasState.stories) {
    for (const zone of story.zoneAssignments) {
      if (zone.volume !== undefined && zone.volume <= 0) {
        errors.push(`区域 "${zone.name}": 体积必须大于 0（当前: ${zone.volume}）`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * L-36: Runtime structural validation of topology JSON before engine call.
 * Returns error strings; empty array = valid.
 */
export function validateTopology(topo: Record<string, unknown>): string[] {
  const errs: string[] = [];

  if (!Array.isArray(topo.nodes) || topo.nodes.length === 0) {
    errs.push('拓扑缺少 nodes 数组');
    return errs;
  }
  if (!Array.isArray(topo.links)) {
    errs.push('拓扑缺少 links 数组');
    return errs;
  }

  const nodeIds = new Set<number>();
  for (const n of topo.nodes as { id?: number }[]) {
    if (typeof n.id !== 'number') { errs.push('节点缺少数字 id'); continue; }
    if (nodeIds.has(n.id)) errs.push(`节点 ID ${n.id} 重复`);
    nodeIds.add(n.id);
  }

  for (const l of topo.links as { id?: number; from?: number; to?: number; element?: { type?: string } }[]) {
    if (typeof l.id !== 'number') { errs.push('链接缺少数字 id'); continue; }
    if (typeof l.from !== 'number' || !nodeIds.has(l.from)) errs.push(`链接 ${l.id}: from 节点 ${l.from} 不存在`);
    if (typeof l.to !== 'number' || !nodeIds.has(l.to)) errs.push(`链接 ${l.id}: to 节点 ${l.to} 不存在`);
    if (!l.element || typeof l.element.type !== 'string') errs.push(`链接 ${l.id}: 缺少 element.type`);
  }

  if (Array.isArray(topo.sources)) {
    for (const s of topo.sources as { nodeId?: number; speciesIdx?: number }[]) {
      if (typeof s.nodeId !== 'number' || !nodeIds.has(s.nodeId)) errs.push(`污染源引用不存在的节点 ${s.nodeId}`);
    }
  }

  return errs;
}
