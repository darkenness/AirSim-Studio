import { useCanvasStore } from '../../store/useCanvasStore';
import { faceArea, getFaceVertices } from '../../model/geometry';
import type { EdgePlacement } from '../../model/geometry';
import { Trash2, Box } from 'lucide-react';

const PLACEMENT_LABELS: Record<EdgePlacement['type'], string> = {
  door: '门',
  window: '窗',
  opening: '开口',
  fan: '风机',
  duct: '风管',
  damper: '风阀',
  filter: '过滤器',
  crack: '裂缝',
  srv: '自调节通风口',
  checkValve: '单向阀',
};

function InputField({ label, value, onChange, unit, type = 'text', step }: {
  label: string; value: string | number; onChange: (v: string) => void; unit?: string; type?: string; step?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring bg-background"
        />
        {unit && <span className="text-[10px] text-muted-foreground min-w-[24px]">{unit}</span>}
      </div>
    </label>
  );
}

export function ZoneProperties() {
  const selectedFaceId = useCanvasStore(s => s.selectedFaceId);
  const story = useCanvasStore(s => s.getActiveStory());
  const updateZone = useCanvasStore(s => s.updateZone);

  if (!selectedFaceId) return null;
  if (!story) return null;

  const geo = story.geometry;
  const face = geo.faces.find(f => f.id === selectedFaceId);
  if (!face) return null;

  const zone = story.zoneAssignments.find(z => z.faceId === selectedFaceId);
  if (!zone) return null;

  const area = faceArea(geo, face);
  const vertices = getFaceVertices(geo, face);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Box size={16} className="text-primary" />
        <span className="text-sm font-bold text-foreground">区域 / 房间</span>
      </div>

      <InputField
        label="名称"
        value={zone.name}
        onChange={(v) => updateZone(selectedFaceId, { name: v })}
      />
      <InputField
        label="温度"
        value={zone.temperature}
        unit="K"
        type="number"
        step="0.1"
        onChange={(v) => updateZone(selectedFaceId, { temperature: parseFloat(v) || 293.15 })}
      />
      <InputField
        label="体积"
        value={zone.volume}
        unit="m³"
        type="number"
        step="1"
        onChange={(v) => updateZone(selectedFaceId, { volume: parseFloat(v) || 0 })}
      />

      <div className="mt-1 px-2 py-1.5 bg-muted rounded text-[11px] text-muted-foreground space-y-0.5">
        <div>面积: {area.toFixed(2)} m²</div>
        <div>顶点数: {vertices.length}</div>
        <div>Zone ID: {zone.zoneId}</div>
        <div>颜色: <span className="inline-block w-3 h-3 rounded-sm align-middle" style={{ backgroundColor: zone.color }} /></div>
      </div>
    </div>
  );
}

export function EdgeProperties() {
  const selectedEdgeId = useCanvasStore(s => s.selectedEdgeId);
  const story = useCanvasStore(s => s.getActiveStory());
  const removeEdge = useCanvasStore(s => s.removeEdge);
  const selectPlacement = useCanvasStore(s => s.selectPlacement);

  if (!selectedEdgeId) return null;
  if (!story) return null;

  const geo = story.geometry;
  const edge = geo.edges.find(e => e.id === selectedEdgeId);
  if (!edge) return null;

  const length = (() => {
    const v1 = geo.vertices.find(v => v.id === edge.vertexIds[0]);
    const v2 = geo.vertices.find(v => v.id === edge.vertexIds[1]);
    if (!v1 || !v2) return 0;
    return Math.sqrt((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2);
  })();

  const facesCount = edge.faceIds.length;

  // Get connected zone names
  const connectedZones = edge.faceIds.map(fId => {
    const zone = story.zoneAssignments.find(z => z.faceId === fId);
    return zone ? zone.name : '未命名';
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-muted-foreground rounded-sm" />
        <span className="text-sm font-bold text-foreground">墙壁</span>
        <button
          onClick={() => removeEdge(selectedEdgeId)}
          className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="px-2 py-2 bg-muted rounded text-[11px] text-muted-foreground space-y-0.5">
        <div>长度: {length.toFixed(2)} m</div>
        <div>高度: {edge.wallHeight.toFixed(1)} m</div>
        <div>厚度: {edge.wallThickness.toFixed(2)} m</div>
        <div>类型: {edge.isExterior ? '外墙（面向室外）' : '内墙（共用墙）'}</div>
      </div>

      {/* Connected zones info */}
      <div className="border-t border-border pt-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          相邻区域
        </span>
        {facesCount === 0 ? (
          <div className="mt-1 text-xs text-amber-500">⚠ 未闭合墙壁（无相邻区域）</div>
        ) : facesCount === 1 ? (
          <div className="mt-1 text-xs text-muted-foreground">
            内侧: <span className="text-foreground font-medium">{connectedZones[0]}</span>
            &nbsp;→&nbsp;外侧: <span className="text-foreground font-medium">室外</span>
          </div>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{connectedZones[0]}</span>
            &nbsp;⟷&nbsp;
            <span className="text-foreground font-medium">{connectedZones[1]}</span>
            <div className="mt-0.5 text-[10px]">在此墙上放置门/窗可连通两个房间</div>
          </div>
        )}
      </div>

      {/* Placements on this edge */}
      {story.placements.filter(p => p.edgeId === selectedEdgeId).length > 0 && (
        <div className="border-t border-border pt-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            此墙上的组件（点击编辑参数）
          </span>
          <div className="mt-1 space-y-1">
            {story.placements
              .filter(p => p.edgeId === selectedEdgeId)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPlacement(p.id)}
                  className="w-full flex items-center gap-2 text-xs px-2 py-1.5 bg-muted rounded hover:bg-accent transition-colors text-left"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.isConfigured ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                  <span className="text-foreground">{PLACEMENT_LABELS[p.type] || p.type}</span>
                  <span className="text-muted-foreground ml-auto">α={p.alpha.toFixed(2)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlacementProperties() {
  const selectedPlacementId = useCanvasStore(s => s.selectedPlacementId);
  const story = useCanvasStore(s => s.getActiveStory());
  const updatePlacement = useCanvasStore(s => s.updatePlacement);
  const removePlacement = useCanvasStore(s => s.removePlacement);

  if (!selectedPlacementId) return null;
  if (!story) return null;

  const placement = story.placements.find(p => p.id === selectedPlacementId);
  if (!placement) return null;

  const geo = story.geometry;
  const edge = geo.edges.find(e => e.id === placement.edgeId);

  // Connected zone names
  const connectedZones = edge ? edge.faceIds.map(fId => {
    const zone = story.zoneAssignments.find(z => z.faceId === fId);
    return zone ? zone.name : '未命名';
  }) : [];

  const isSharedWall = edge ? edge.faceIds.length === 2 : false;
  const isExteriorWall = edge ? edge.faceIds.length === 1 : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full shrink-0 ${placement.isConfigured ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
        <span className="text-sm font-bold text-foreground">
          {PLACEMENT_LABELS[placement.type] || placement.type}
        </span>
        <button
          onClick={() => removePlacement(selectedPlacementId)}
          className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Connectivity info */}
      <div className="px-2 py-2 bg-muted rounded text-[11px] text-muted-foreground space-y-0.5">
        {isSharedWall && (
          <div>连通: <span className="text-foreground font-medium">{connectedZones[0]}</span> ⟷ <span className="text-foreground font-medium">{connectedZones[1]}</span></div>
        )}
        {isExteriorWall && (
          <div>连通: <span className="text-foreground font-medium">{connectedZones[0]}</span> → <span className="text-foreground font-medium">室外</span></div>
        )}
        {!isSharedWall && !isExteriorWall && (
          <div className="text-amber-500">⚠ 未闭合墙壁上的组件</div>
        )}
        <div>位置: α = {placement.alpha.toFixed(2)}</div>
      </div>

      {/* Placement-specific parameters */}
      <div className="border-t border-border pt-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          气流元件参数
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">元件类型</span>
        <select
          value={placement.type}
          onChange={(e) => updatePlacement(selectedPlacementId, {
            type: e.target.value as EdgePlacement['type'],
          })}
          className="px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring bg-background"
        >
          <option value="door">门</option>
          <option value="window">窗</option>
          <option value="opening">开口</option>
          <option value="crack">裂缝</option>
          <option value="fan">风机</option>
          <option value="duct">风管</option>
          <option value="damper">风阀</option>
          <option value="filter">过滤器</option>
          <option value="srv">自调节通风口</option>
          <option value="checkValve">单向阀</option>
        </select>
      </label>

      <InputField
        label="相对标高"
        value={placement.relativeElevation ?? 0}
        unit="m"
        type="number"
        step="0.1"
        onChange={(v) => updatePlacement(selectedPlacementId, {
          relativeElevation: parseFloat(v) || 0,
        })}
      />

      <InputField
        label="乘子 (数量)"
        value={placement.multiplier ?? 1}
        type="number"
        step="1"
        onChange={(v) => updatePlacement(selectedPlacementId, {
          multiplier: Math.max(1, parseInt(v) || 1),
        })}
      />

      {/* Type-specific parameters */}
      {(placement.type === 'door' || placement.type === 'crack' || placement.type === 'window') && (
        <>
          <InputField
            label="流动系数 (C)"
            value={placement.flowCoefficient ?? 0.001}
            type="number"
            step="0.0001"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              flowCoefficient: parseFloat(v) || 0.001, isConfigured: true,
            })}
          />
          <InputField
            label="流动指数 (n)"
            value={placement.flowExponent ?? 0.65}
            type="number"
            step="0.01"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              flowExponent: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0.65)),
              isConfigured: true,
            })}
          />
        </>
      )}

      {placement.type === 'opening' && (
        <>
          <InputField
            label="流量系数 (Cd)"
            value={placement.dischargeCd ?? 0.65}
            type="number"
            step="0.01"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              dischargeCd: parseFloat(v) || 0.65, isConfigured: true,
            })}
          />
          <InputField
            label="开口面积"
            value={placement.openingArea ?? 0.5}
            unit="m²"
            type="number"
            step="0.01"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              openingArea: parseFloat(v) || 0.5, isConfigured: true,
            })}
          />
        </>
      )}

      {placement.type === 'fan' && (
        <>
          <InputField
            label="最大风量"
            value={placement.maxFlow ?? 0.05}
            unit="m³/s"
            type="number"
            step="0.001"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              maxFlow: parseFloat(v) || 0.05, isConfigured: true,
            })}
          />
          <InputField
            label="全压截止"
            value={placement.shutoffPressure ?? 200}
            unit="Pa"
            type="number"
            step="10"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              shutoffPressure: parseFloat(v) || 200, isConfigured: true,
            })}
          />
        </>
      )}

      {placement.type === 'damper' && (
        <>
          <InputField
            label="最大流量系数"
            value={placement.flowCoefficient ?? 0.005}
            type="number"
            step="0.001"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              flowCoefficient: parseFloat(v) || 0.005, isConfigured: true,
            })}
          />
          <InputField
            label="开度 (0~1)"
            value={placement.damperFraction ?? 1.0}
            type="number"
            step="0.1"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              damperFraction: Math.max(0, Math.min(1, parseFloat(v) || 1)),
              isConfigured: true,
            })}
          />
        </>
      )}

      {placement.type === 'filter' && (
        <>
          <InputField
            label="流动系数 (C)"
            value={placement.flowCoefficient ?? 0.002}
            type="number"
            step="0.0001"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              flowCoefficient: parseFloat(v) || 0.002, isConfigured: true,
            })}
          />
          <InputField
            label="去除效率 (0~1)"
            value={placement.filterEfficiency ?? 0.9}
            type="number"
            step="0.05"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              filterEfficiency: Math.max(0, Math.min(1, parseFloat(v) || 0.9)),
              isConfigured: true,
            })}
          />
        </>
      )}

      <div className="mt-1 px-2 py-1.5 bg-muted rounded text-[10px] text-muted-foreground">
        ID: {placement.id} &nbsp;|&nbsp; 状态: {placement.isConfigured ? '✅ 已配置' : '🔴 未配置'}
      </div>
    </div>
  );
}

export function StoryProperties() {
  const story = useCanvasStore(s => s.getActiveStory());
  const updateStoryHeight = useCanvasStore(s => s.updateStoryHeight);

  if (!story) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-bold text-foreground">楼层设置</span>
      <InputField
        label="楼层名称"
        value={story.name}
        onChange={() => {}}
      />
      <InputField
        label="层高"
        value={story.floorToCeilingHeight}
        unit="m"
        type="number"
        step="0.1"
        onChange={(v) => updateStoryHeight(story.id, parseFloat(v) || 3.0)}
      />
      <div className="px-2 py-1.5 bg-muted rounded text-[11px] text-muted-foreground space-y-0.5">
        <div>墙壁数: {story.geometry.edges.length}</div>
        <div>区域数: {story.geometry.faces.length}</div>
        <div>组件数: {story.placements.length}</div>
      </div>
    </div>
  );
}
