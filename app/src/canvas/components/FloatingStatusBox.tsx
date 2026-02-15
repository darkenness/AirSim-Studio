import { useState, useEffect, useMemo } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useAppStore } from '../../store/useAppStore';
import { faceArea } from '../../model/geometry';
import type { NodeResult, TransientTimeStep } from '../../types';

// ── Helpers ──

/** Format number: scientific notation for tiny values, fixed decimals otherwise */
function fmt(v: number, decimals = 3): string {
  if (Math.abs(v) < 1e-6 && v !== 0) return v.toExponential(2);
  return v.toFixed(decimals);
}

/** Convert kg/m³ concentration to human-friendly display units */
function concDisplay(kgPerM3: number, molarMass: number): { value: string; unit: string } {
  if (molarMass > 0.1) {
    // Gas — approximate ppm at STP (1 mol ≈ 0.0245 m³)
    const ppm = (kgPerM3 / molarMass) * 24500;
    if (ppm >= 1) return { value: fmt(ppm, 1), unit: 'ppm' };
    return { value: fmt(ppm * 1000, 1), unit: 'ppb' };
  }
  // Particle — show as ug/m³
  const ugPerM3 = kgPerM3 * 1e9;
  if (ugPerM3 >= 1) return { value: fmt(ugPerM3, 1), unit: 'ug/m3' };
  return { value: fmt(kgPerM3, 3), unit: 'kg/m3' };
}

/** Flow direction arrow */
function flowDir(massFlow: number): string {
  if (Math.abs(massFlow) < 1e-10) return '~0';
  return massFlow > 0 ? '\u2192' : '\u2190';
}

/**
 * FloatingStatusBox — Shows zone/edge/placement details on hover.
 * In results mode, displays pressure, temperature, concentration,
 * mass flow, ACH, filter efficiency with Chinese labels.
 */
export function FloatingStatusBox() {
  const hoveredFaceId = useCanvasStore(s => s.hoveredFaceId);
  const hoveredEdgeId = useCanvasStore(s => s.hoveredEdgeId);
  const appMode = useCanvasStore(s => s.appMode);
  const currentTransientStep = useCanvasStore(s => s.currentTransientStep);
  const scaleFactor = useCanvasStore(s => s.scaleFactor);
  const story = useCanvasStore(s => s.getActiveStory());

  const result = useAppStore(s => s.result);
  const transientResult = useAppStore(s => s.transientResult);
  const species = useAppStore(s => s.species);
  const appLinks = useAppStore(s => s.links);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Resolve active transient time step
  const transientStep: TransientTimeStep | null = useMemo(() => {
    if (!transientResult || transientResult.timeSeries.length === 0) return null;
    const idx = Math.min(currentTransientStep, transientResult.timeSeries.length - 1);
    return transientResult.timeSeries[idx] ?? null;
  }, [transientResult, currentTransientStep]);

  const isResults = appMode === 'results';

  if (!hoveredFaceId && !hoveredEdgeId) return null;
  if (!story) return null;

  const geo = story.geometry;

  const tooltipStyle = {
    left: Math.min(mousePos.x, window.innerWidth - 240),
    top: Math.max(60, Math.min(mousePos.y, window.innerHeight - 160)),
    transform: 'translate(16px, -50%)',
  };

  // ════════════════════════════════════════════════════════════════
  // Zone (Face) hover
  // ════════════════════════════════════════════════════════════════
  if (hoveredFaceId) {
    const face = geo.faces.find(f => f.id === hoveredFaceId);
    if (!face) return null;
    const zone = story.zoneAssignments.find(z => z.faceId === hoveredFaceId);
    if (!zone) return null;
    const rawArea = faceArea(geo, face);
    const area = rawArea * scaleFactor * scaleFactor;

    // Resolve results data
    let nodeResult: NodeResult | null = null;
    let zoneConcentrations: number[] | null = null;
    let zonePressure: number | null = null;

    if (isResults) {
      if (transientStep && transientResult) {
        const nodeIdx = transientResult.nodes.findIndex(n => n.id === zone.zoneId);
        if (nodeIdx >= 0) {
          zonePressure = transientStep.airflow.pressures[nodeIdx] ?? null;
          zoneConcentrations = transientStep.concentrations[nodeIdx] ?? null;
        }
      } else if (result) {
        nodeResult = result.nodes.find(n => n.id === zone.zoneId) ?? null;
      }
    }

    // Compute ACH (air changes per hour)
    let ach: number | null = null;
    if (isResults && zone.volume > 0) {
      if (transientStep && transientResult) {
        let totalVolFlow = 0;
        for (let li = 0; li < appLinks.length; li++) {
          const link = appLinks[li];
          if (link.from === zone.zoneId || link.to === zone.zoneId) {
            const mf = transientStep.airflow.massFlows[li];
            if (mf !== undefined) totalVolFlow += Math.abs(mf) / 1.2;
          }
        }
        ach = (totalVolFlow * 3600) / zone.volume;
      } else if (result) {
        let totalVolFlow = 0;
        for (const lr of result.links) {
          if (lr.from === zone.zoneId || lr.to === zone.zoneId) {
            totalVolFlow += Math.abs(lr.volumeFlow_m3s);
          }
        }
        ach = (totalVolFlow * 3600) / zone.volume;
      }
    }

    const speciesList = transientResult?.species ?? species;

    return (
      <div className="pointer-events-none absolute inset-0 z-40">
        <div
          className="absolute bg-card/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-0.5 min-w-[160px] max-w-[260px]"
          style={tooltipStyle}
        >
          <div className="font-semibold text-foreground">{zone.name}</div>
          <div className="text-muted-foreground">面积: {area.toFixed(2)} m²</div>
          <div className="text-muted-foreground">温度: {(zone.temperature - 273.15).toFixed(1)}°C</div>
          <div className="text-muted-foreground">体积: {zone.volume.toFixed(1)} m³</div>

          {/* Steady-state results */}
          {nodeResult && (
            <>
              <div className="border-t border-border my-1" />
              <div className="font-medium text-foreground/80 text-[10px] uppercase tracking-wide">稳态结果</div>
              <div className="text-purple-400 font-mono">压力: {fmt(nodeResult.pressure)} Pa</div>
              <div className="text-blue-400 font-mono">温度: {fmt(nodeResult.temperature - 273.15, 1)}°C</div>
              <div className="text-cyan-400 font-mono">密度: {fmt(nodeResult.density, 4)} kg/m³</div>
              {ach !== null && (
                <div className="text-green-400 font-mono">换气: {fmt(ach, 2)} ACH</div>
              )}
            </>
          )}

          {/* Transient results */}
          {zonePressure !== null && transientStep && (
            <>
              <div className="border-t border-border my-1" />
              <div className="font-medium text-foreground/80 text-[10px] uppercase tracking-wide">
                瞬态 t={fmt(transientStep.time, 1)}s
              </div>
              <div className="text-purple-400 font-mono">压力: {fmt(zonePressure)} Pa</div>
              {ach !== null && (
                <div className="text-green-400 font-mono">换气: {fmt(ach, 2)} ACH</div>
              )}
            </>
          )}

          {/* Concentrations per species */}
          {zoneConcentrations && zoneConcentrations.length > 0 && (
            <>
              <div className="border-t border-border my-1" />
              <div className="font-medium text-foreground/80 text-[10px] uppercase tracking-wide">浓度</div>
              {zoneConcentrations.map((conc, si) => {
                const sp = speciesList[si];
                if (!sp) return null;
                const { value, unit } = concDisplay(conc, sp.molarMass);
                return (
                  <div key={si} className="text-orange-400 font-mono truncate">
                    {sp.name}: {value} {unit}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // Edge / Placement hover
  // ════════════════════════════════════════════════════════════════
  if (hoveredEdgeId) {
    const edge = geo.edges.find(e => e.id === hoveredEdgeId);
    if (!edge) return null;
    const v1 = geo.vertices.find(v => v.id === edge.vertexIds[0]);
    const v2 = geo.vertices.find(v => v.id === edge.vertexIds[1]);
    const rawLength = v1 && v2 ? Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2) : 0;
    const length = rawLength * scaleFactor;

    const placementsOnEdge = story.placements.filter(p => p.edgeId === hoveredEdgeId);

    const connectedZones = edge.faceIds.map(fId => {
      const z = story.zoneAssignments.find(za => za.faceId === fId);
      return z ? { name: z.name, zoneId: z.zoneId } : { name: '未命名', zoneId: -1 };
    });

    // Resolve link results for this edge
    const edgeLinkResults: Array<{
      massFlow: number;
      deltaP: number;
      fromName: string;
      toName: string;
      filterEfficiency: number | null;
    }> = [];

    if (isResults) {
      let fromZoneId = 0, toZoneId = 0;
      let fromName = '室外', toName = '室外';
      if (edge.faceIds.length === 2) {
        const z1 = story.zoneAssignments.find(z => z.faceId === edge.faceIds[0]);
        const z2 = story.zoneAssignments.find(z => z.faceId === edge.faceIds[1]);
        fromZoneId = z1?.zoneId ?? 0;
        toZoneId = z2?.zoneId ?? 0;
        fromName = z1?.name ?? '未命名';
        toName = z2?.name ?? '未命名';
      } else if (edge.faceIds.length === 1) {
        const z1 = story.zoneAssignments.find(z => z.faceId === edge.faceIds[0]);
        fromZoneId = z1?.zoneId ?? 0;
        toZoneId = 0;
        fromName = z1?.name ?? '未命名';
        toName = '室外';
      }

      if (transientStep && transientResult) {
        for (let li = 0; li < appLinks.length; li++) {
          const link = appLinks[li];
          const matches = (link.from === fromZoneId && link.to === toZoneId) ||
                          (link.from === toZoneId && link.to === fromZoneId);
          if (!matches) continue;

          const mf = transientStep.airflow.massFlows[li] ?? 0;
          const sign = link.from === fromZoneId ? 1 : -1;

          const fromIdx = transientResult.nodes.findIndex(n => n.id === fromZoneId);
          const toIdx = transientResult.nodes.findIndex(n => n.id === toZoneId);
          const pFrom = fromIdx >= 0 ? (transientStep.airflow.pressures[fromIdx] ?? 0) : 0;
          const pTo = toIdx >= 0 ? (transientStep.airflow.pressures[toIdx] ?? 0) : 0;

          const filterPlacement = placementsOnEdge.find(p => p.type === 'filter');
          const filterEff = filterPlacement?.filterEfficiency ?? link.element?.efficiency ?? null;

          edgeLinkResults.push({
            massFlow: mf * sign,
            deltaP: pFrom - pTo,
            fromName,
            toName,
            filterEfficiency: filterEff,
          });
        }
      } else if (result) {
        for (const lr of result.links) {
          const matches = (lr.from === fromZoneId && lr.to === toZoneId) ||
                          (lr.from === toZoneId && lr.to === fromZoneId);
          if (!matches) continue;

          const sign = lr.from === fromZoneId ? 1 : -1;
          const nFrom = result.nodes.find(n => n.id === fromZoneId);
          const nTo = result.nodes.find(n => n.id === toZoneId);
          const deltaP = (nFrom?.pressure ?? 0) - (nTo?.pressure ?? 0);

          const filterPlacement = placementsOnEdge.find(p => p.type === 'filter');
          const matchingAppLink = appLinks.find(l =>
            (l.from === fromZoneId && l.to === toZoneId) ||
            (l.from === toZoneId && l.to === fromZoneId)
          );
          const filterEff = filterPlacement?.filterEfficiency ?? matchingAppLink?.element?.efficiency ?? null;

          edgeLinkResults.push({
            massFlow: lr.massFlow * sign,
            deltaP,
            fromName,
            toName,
            filterEfficiency: filterEff,
          });
        }
      }
    }

    return (
      <div className="pointer-events-none absolute inset-0 z-40">
        <div
          className="absolute bg-card/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-0.5 min-w-[140px] max-w-[260px]"
          style={tooltipStyle}
        >
          <div className="font-semibold text-foreground">墙壁 ({edge.isExterior ? '外墙' : '内墙'})</div>
          <div className="text-muted-foreground">长度: {length.toFixed(2)} m</div>
          {connectedZones.length === 2 && (
            <div className="text-muted-foreground">{connectedZones[0].name} ⟷ {connectedZones[1].name}</div>
          )}
          {connectedZones.length === 1 && (
            <div className="text-muted-foreground">{connectedZones[0].name} → 室外</div>
          )}
          {placementsOnEdge.length > 0 && (
            <div className="text-amber-500">组件: {placementsOnEdge.length}</div>
          )}

          {/* Results data for links on this edge */}
          {edgeLinkResults.length > 0 && (
            <>
              <div className="border-t border-border my-1" />
              <div className="font-medium text-foreground/80 text-[10px] uppercase tracking-wide">
                {transientStep ? `瞬态 t=${fmt(transientStep.time, 1)}s` : '稳态结果'}
              </div>
              {edgeLinkResults.map((lr, i) => (
                <div key={i} className="space-y-0.5">
                  {edgeLinkResults.length > 1 && (
                    <div className="text-muted-foreground text-[10px]">路径 {i + 1}</div>
                  )}
                  <div className="text-blue-400 font-mono">
                    流量: {fmt(Math.abs(lr.massFlow), 4)} kg/s {flowDir(lr.massFlow)}
                  </div>
                  <div className="text-purple-400 font-mono">
                    压差: {fmt(lr.deltaP)} Pa
                  </div>
                  <div className="text-muted-foreground font-mono text-[10px]">
                    {lr.massFlow >= 0 ? `${lr.fromName} \u2192 ${lr.toName}` : `${lr.toName} \u2192 ${lr.fromName}`}
                  </div>
                  {lr.filterEfficiency !== null && lr.filterEfficiency !== undefined && (
                    <div className="text-emerald-400 font-mono">
                      过滤效率: {(lr.filterEfficiency * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
