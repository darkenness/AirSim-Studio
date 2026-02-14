import { useCanvasStore } from '../../store/useCanvasStore';
import { useAppStore } from '../../store/useAppStore';
import { faceArea } from '../../model/geometry';

/**
 * FloatingStatusBox — Shows zone/edge/placement details on hover.
 * Positioned near cursor in screen space as an HTML overlay.
 */
export function FloatingStatusBox() {
  const hoveredFaceId = useCanvasStore(s => s.hoveredFaceId);
  const hoveredEdgeId = useCanvasStore(s => s.hoveredEdgeId);
  const cursorWorld = useCanvasStore(s => s.cursorWorld);
  const appMode = useCanvasStore(s => s.appMode);
  const story = useCanvasStore(s => s.getActiveStory());
  const result = useAppStore(s => s.result);

  if (!hoveredFaceId && !hoveredEdgeId) return null;
  if (!cursorWorld) return null;

  const geo = story.geometry;

  // Zone hover info
  if (hoveredFaceId) {
    const face = geo.faces.find(f => f.id === hoveredFaceId);
    if (!face) return null;
    const zone = story.zoneAssignments.find(z => z.faceId === hoveredFaceId);
    if (!zone) return null;
    const area = faceArea(geo, face);

    // Get result data if in results mode
    const nodeResult = appMode === 'results' && result
      ? result.nodes.find((n: { id: number }) => n.id === zone.zoneId)
      : null;

    return (
      <div className="pointer-events-none absolute inset-0 z-40">
        <div
          className="absolute bg-card/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-0.5 min-w-[140px]"
          style={{ left: cursorWorld.x, top: cursorWorld.y, transform: 'translate(16px, -50%)' }}
        >
          <div className="font-semibold text-foreground">{zone.name}</div>
          <div className="text-muted-foreground">面积: {area.toFixed(2)} m²</div>
          <div className="text-muted-foreground">温度: {(zone.temperature - 273.15).toFixed(1)}°C</div>
          <div className="text-muted-foreground">体积: {zone.volume.toFixed(1)} m³</div>
          {nodeResult && (
            <>
              <div className="border-t border-border my-0.5" />
              <div className="text-purple-500 font-mono">P = {(nodeResult as { pressure: number }).pressure?.toFixed(3)} Pa</div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Edge hover info
  if (hoveredEdgeId) {
    const edge = geo.edges.find(e => e.id === hoveredEdgeId);
    if (!edge) return null;
    const v1 = geo.vertices.find(v => v.id === edge.vertexIds[0]);
    const v2 = geo.vertices.find(v => v.id === edge.vertexIds[1]);
    const length = v1 && v2 ? Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2) : 0;

    const placementsOnEdge = story.placements.filter(p => p.edgeId === hoveredEdgeId);
    const connectedZones = edge.faceIds.map(fId => {
      const z = story.zoneAssignments.find(za => za.faceId === fId);
      return z ? z.name : '未命名';
    });

    return (
      <div className="pointer-events-none absolute inset-0 z-40">
        <div
          className="absolute bg-card/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-0.5 min-w-[120px]"
          style={{ left: cursorWorld.x, top: cursorWorld.y, transform: 'translate(16px, -50%)' }}
        >
          <div className="font-semibold text-foreground">
            {edge.isExterior ? '外墙' : '内墙'}
          </div>
          <div className="text-muted-foreground">长度: {length.toFixed(2)} m</div>
          {connectedZones.length === 2 && (
            <div className="text-muted-foreground">{connectedZones[0]} ⟷ {connectedZones[1]}</div>
          )}
          {connectedZones.length === 1 && (
            <div className="text-muted-foreground">{connectedZones[0]} → 室外</div>
          )}
          {placementsOnEdge.length > 0 && (
            <div className="text-amber-500">组件: {placementsOnEdge.length}</div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
