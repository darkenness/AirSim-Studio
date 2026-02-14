import { Html } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { getPositionOnEdge } from '../../model/geometry';

/**
 * Flow arrows on edges (doors/windows) showing mass flow direction and magnitude
 */
export function FlowArrows() {
  const result = useAppStore(s => s.result);
  const story = useCanvasStore(s => s.getActiveStory());
  const appMode = useCanvasStore(s => s.appMode);

  if (appMode !== 'results' || !result) return null;

  const geo = story.geometry;

  return (
    <group>
      {story.placements.map((placement) => {
        const edge = geo.edges.find(e => e.id === placement.edgeId);
        if (!edge) return null;

        const pos = getPositionOnEdge(geo, edge, placement.alpha);
        if (!pos) return null;

        // Match placement → link result via zone IDs on the edge's faces
        const faceIds = edge.faceIds;
        const z1 = faceIds[0] ? story.zoneAssignments.find(z => z.faceId === faceIds[0]) : undefined;
        const z2 = faceIds[1] ? story.zoneAssignments.find(z => z.faceId === faceIds[1]) : undefined;
        const fromId = z1?.zoneId ?? 0;
        const toId = z2?.zoneId ?? 0;
        if (fromId === toId) return null;

        const linkResult = result.links.find(l =>
          (l.from === fromId && l.to === toId) || (l.from === toId && l.to === fromId)
        );
        if (!linkResult) return null;

        const flowMag = Math.abs(linkResult.massFlow);
        const isPositive = linkResult.massFlow > 0;
        const arrowColor = isPositive ? '#10b981' : '#f43f5e';
        const arrowScale = Math.min(1.5, 0.3 + flowMag * 100);

        return (
          <group key={placement.id} position={[pos.x, story.floorToCeilingHeight * 0.5, pos.y]}>
            <mesh rotation={[0, 0, isPositive ? 0 : Math.PI]}>
              <coneGeometry args={[0.1 * arrowScale, 0.3 * arrowScale, 8]} />
              <meshBasicMaterial color={arrowColor} transparent opacity={0.8} />
            </mesh>
            <Html position={[0, 0.4, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
              <div className="text-[8px] font-mono font-bold whitespace-nowrap" style={{ color: arrowColor }}>
                {(flowMag * 1000).toFixed(2)} g/s
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Zone data floats showing real-time pressure/temperature/concentration
 */
export function ZoneDataFloats() {
  const result = useAppStore(s => s.result);
  const transientResult = useAppStore(s => s.transientResult);
  const appMode = useCanvasStore(s => s.appMode);
  const story = useCanvasStore(s => s.getActiveStory());
  if (appMode !== 'results') return null;
  if (!result && !transientResult) return null;

  const geo = story.geometry;

  return (
    <group>
      {story.zoneAssignments.map(zone => {
        const face = geo.faces.find(f => f.id === zone.faceId);
        if (!face) return null;

        // Get centroid
        const verts = face.edgeIds.map(eid => {
          const edge = geo.edges.find(e => e.id === eid);
          if (!edge) return null;
          return geo.vertices.find(v => v.id === edge.vertexIds[0]);
        }).filter(Boolean);

        if (verts.length === 0) return null;
        const cx = verts.reduce((s, v) => s + (v?.x ?? 0), 0) / verts.length;
        const cy = verts.reduce((s, v) => s + (v?.y ?? 0), 0) / verts.length;

        // Get result data
        const nodeResult = result?.nodes.find(n => n.id === zone.zoneId);
        const pressure = nodeResult?.pressure ?? 0;

        return (
          <Html
            key={zone.faceId}
            position={[cx, story.floorToCeilingHeight + 0.3, cy]}
            center
            distanceFactor={12}
            style={{ pointerEvents: 'none' }}
          >
            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded px-1.5 py-0.5 shadow-sm text-center">
              <div className="text-[9px] font-semibold text-slate-700">{zone.name}</div>
              <div className="text-[8px] text-purple-600 font-mono">{pressure.toFixed(2)} Pa</div>
              <div className="text-[8px] text-slate-400">{(zone.temperature - 273.15).toFixed(0)}°C</div>
            </div>
          </Html>
        );
      })}
    </group>
  );
}

/**
 * Concentration heatmap: changes zone floor colors based on concentration
 */
export function ConcentrationHeatmap() {
  const transientResult = useAppStore(s => s.transientResult);
  const appMode = useCanvasStore(s => s.appMode);

  if (appMode !== 'results' || !transientResult) return null;

  // This component modifies zone floor colors through the store
  // The actual color mapping is done in ZoneFloor component based on appMode
  return null;
}

/**
 * Get heatmap color for a concentration value
 */
export function getHeatmapColor(value: number, maxConc: number): string {
  if (maxConc <= 0 || value <= 0) return '#e0f2fe'; // default zone blue
  const ratio = Math.min(value / maxConc, 1.0);

  // Safe(blue-green) → Warning(orange) → Danger(red)
  if (ratio < 0.33) {
    // Blue-green
    const t = ratio / 0.33;
    const r = Math.round(200 - t * 50);
    const g = Math.round(240 - t * 30);
    const b = Math.round(250 - t * 100);
    return `rgb(${r},${g},${b})`;
  } else if (ratio < 0.66) {
    // Orange
    const t = (ratio - 0.33) / 0.33;
    const r = Math.round(150 + t * 105);
    const g = Math.round(210 - t * 100);
    const b = Math.round(150 - t * 100);
    return `rgb(${r},${g},${b})`;
  } else {
    // Red
    const t = (ratio - 0.66) / 0.34;
    const r = 255;
    const g = Math.round(110 - t * 80);
    const b = Math.round(50 - t * 50);
    return `rgb(${r},${g},${b})`;
  }
}
