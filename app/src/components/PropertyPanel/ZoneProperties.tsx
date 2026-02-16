import { useCanvasStore } from '../../store/useCanvasStore';
import { useAppStore } from '../../store/useAppStore';
import { faceArea, getFaceVertices } from '../../model/geometry';
import type { EdgePlacement } from '../../model/geometry';
import { Trash2, Box, CheckCircle2, AlertCircle } from 'lucide-react';
import { InputField } from '../ui/input-field';

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
        <span className="text-base font-semibold text-slate-800 dark:text-slate-200">区域 / 房间</span>
      </div>

      <InputField
        label="名称"
        value={zone.name}
        onChange={(v) => updateZone(selectedFaceId, { name: v })}
      />
      <InputField
        label="温度"
        value={+(zone.temperature - 273.15).toFixed(1)}
        unit="°C"
        type="number"
        step="0.1"
        onChange={(v) => updateZone(selectedFaceId, { temperature: (parseFloat(v) || 20) + 273.15 })}
      />
      <InputField
        label="体积"
        value={zone.volume}
        unit="m³"
        type="number"
        step="1"
        onChange={(v) => updateZone(selectedFaceId, { volume: parseFloat(v) || 0 })}
      />

      <div className="mt-1 px-2.5 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-[11px] text-slate-400 dark:text-slate-500 space-y-0.5">
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
  const updateEdge = useCanvasStore(s => s.updateEdge);
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
        <span className="text-base font-semibold text-slate-800 dark:text-slate-200">墙壁</span>
        <button
          onClick={() => removeEdge(selectedEdgeId)}
          className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="px-3 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-400 dark:text-slate-500 space-y-2.5">
        <div>长度: {length.toFixed(2)} m</div>
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">高度</span>
          <div className="flex items-center gap-1.5 w-[58%] shrink-0">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={edge.wallHeight}
              onChange={(e) => updateEdge(selectedEdgeId, { wallHeight: parseFloat(e.target.value) || 3.0 })}
              className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">m</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">厚度</span>
          <div className="flex items-center gap-1.5 w-[58%] shrink-0">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={edge.wallThickness}
              onChange={(e) => updateEdge(selectedEdgeId, { wallThickness: parseFloat(e.target.value) || 0.2 })}
              className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">m</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">类型</span>
          <div className="w-[58%] shrink-0">
            <select
              value={edge.isExterior ? 'exterior' : 'interior'}
              onChange={(e) => updateEdge(selectedEdgeId, { isExterior: e.target.value === 'exterior' })}
              className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            >
              <option value="exterior">外墙（面向室外）</option>
              <option value="interior">内墙（共用墙）</option>
            </select>
          </div>
        </div>
      </div>

      {/* Connected zones info */}
      <div className="border-t border-slate-100 dark:border-slate-700/50 pt-2">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
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
        <div className="border-t border-slate-100 dark:border-slate-700/50 pt-2">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          此墙上的组件（点击编辑参数）
        </span>
          <div className="mt-1.5 space-y-1">
            {story.placements
              .filter(p => p.edgeId === selectedEdgeId)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPlacement(p.id)}
                  className="w-full flex items-center gap-2 text-xs px-2.5 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-left"
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
        <span className="text-base font-semibold text-slate-800 dark:text-slate-200">
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
      <div className="px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-[11px] text-slate-400 dark:text-slate-500 space-y-0.5">
        {isSharedWall && (
          <div>连通: <span className="text-foreground font-medium">{connectedZones[0]}</span> ⟷ <span className="text-foreground font-medium">{connectedZones[1]}</span></div>
        )}
        {isExteriorWall && (
          <div>连通: <span className="text-foreground font-medium">{connectedZones[0]}</span> → <span className="text-foreground font-medium">室外</span></div>
        )}
        {!isSharedWall && !isExteriorWall && (
          <div className="text-amber-500">⚠ 未闭合墙壁上的组件</div>
        )}
        {/* H-03: Editable alpha slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">位置 α</span>
          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.01"
            value={placement.alpha}
            onChange={(e) => updatePlacement(selectedPlacementId, { alpha: parseFloat(e.target.value) })}
            className="flex-1 h-1 accent-primary"
          />
          <span className="text-[10px] text-foreground font-mono w-8 text-right">{placement.alpha.toFixed(2)}</span>
        </div>
      </div>

      {/* M-03: Schedule binding */}
      <ScheduleBinding placementId={selectedPlacementId} scheduleId={placement.scheduleId} />

      {/* Placement-specific parameters */}
      <div className="border-t border-slate-100 dark:border-slate-700/50 pt-2">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          气流元件参数
        </span>
      </div>

      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">元件类型</span>
        <div className="w-[58%] shrink-0">
          <select
            value={placement.type}
            onChange={(e) => {
              const newType = e.target.value as EdgePlacement['type'];
              // Reset type-specific fields when switching type
              updatePlacement(selectedPlacementId, {
                type: newType,
                isConfigured: false,
                flowCoefficient: undefined,
                flowExponent: undefined,
                dischargeCd: undefined,
                openingArea: undefined,
                openingHeight: undefined,
                maxFlow: undefined,
                shutoffPressure: undefined,
                damperFraction: undefined,
                filterEfficiency: undefined,
                ductDiameter: undefined,
                ductRoughness: undefined,
                ductSumK: undefined,
                targetFlow: undefined,
                pMin: undefined,
                pMax: undefined,
              });
            }}
            className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white dark:bg-slate-800 transition-colors"
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
        </div>
      </div>

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
      {placement.type === 'door' && (
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
            value={placement.openingArea ?? 1.8}
            unit="m²"
            type="number"
            step="0.01"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              openingArea: parseFloat(v) || 1.8, isConfigured: true,
            })}
          />
          <InputField
            label="开口高度"
            value={placement.openingHeight ?? 2.0}
            unit="m"
            type="number"
            step="0.1"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              openingHeight: parseFloat(v) || 2.0, isConfigured: true,
            })}
          />
        </>
      )}

      {(placement.type === 'crack' || placement.type === 'window') && (
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
          <InputField
            label="开口高度"
            value={placement.openingHeight ?? 2.0}
            unit="m"
            type="number"
            step="0.1"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              openingHeight: parseFloat(v) || 2.0, isConfigured: true,
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

      {placement.type === 'duct' && (
        <>
          <InputField
            label="管径"
            value={placement.ductDiameter ?? 0.2}
            unit="m"
            type="number"
            step="0.01"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              ductDiameter: parseFloat(v) || 0.2, isConfigured: true,
            })}
          />
          <InputField
            label="粗糙度"
            value={placement.ductRoughness ?? 0.0001}
            unit="m"
            type="number"
            step="0.00001"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              ductRoughness: parseFloat(v) || 0.0001, isConfigured: true,
            })}
          />
          <InputField
            label="局部损失系数 (ΣK)"
            value={placement.ductSumK ?? 0}
            type="number"
            step="0.1"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              ductSumK: parseFloat(v) || 0, isConfigured: true,
            })}
          />
        </>
      )}

      {placement.type === 'srv' && (
        <>
          <InputField
            label="目标流量"
            value={placement.targetFlow ?? 0.01}
            unit="m³/s"
            type="number"
            step="0.001"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              targetFlow: parseFloat(v) || 0.01, isConfigured: true,
            })}
          />
          <InputField
            label="最小调节压差"
            value={placement.pMin ?? 2.0}
            unit="Pa"
            type="number"
            step="0.5"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              pMin: parseFloat(v) || 2.0, isConfigured: true,
            })}
          />
          <InputField
            label="最大调节压差"
            value={placement.pMax ?? 50.0}
            unit="Pa"
            type="number"
            step="1"
            onChange={(v) => updatePlacement(selectedPlacementId, {
              pMax: parseFloat(v) || 50.0, isConfigured: true,
            })}
          />
        </>
      )}

      {placement.type === 'checkValve' && (
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

      <div className="mt-1 px-2.5 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-[10px] text-slate-400 dark:text-slate-500">
        ID: {placement.id} &nbsp;|&nbsp; 状态: {placement.isConfigured
          ? <span className="inline-flex items-center gap-0.5 text-emerald-600"><CheckCircle2 size={12} /> 已配置</span>
          : <span className="inline-flex items-center gap-0.5 text-destructive"><AlertCircle size={12} /> 未配置</span>
        }
      </div>
    </div>
  );
}

// M-03: Schedule binding dropdown for placements
function ScheduleBinding({ placementId, scheduleId }: { placementId: string; scheduleId?: string }) {
  const schedules = useAppStore(s => s.schedules);
  const weekSchedules = useAppStore(s => s.weekSchedules);
  const updatePlacement = useCanvasStore(s => s.updatePlacement);

  const allSchedules = [
    ...schedules.map(s => ({ id: s.id, name: s.name, type: '日' })),
    ...weekSchedules.map(w => ({ id: w.id, name: w.name, type: '周' })),
  ];

  return (
    <div className="flex items-center justify-between gap-4 mb-1">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">运行时间表</span>
      <div className="w-[58%] shrink-0">
        <select
          value={scheduleId ?? ''}
          onChange={(e) => updatePlacement(placementId, { scheduleId: e.target.value || undefined })}
          className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        >
          <option value="">无（始终运行）</option>
          {allSchedules.map(s => (
            <option key={s.id} value={s.id}>[{s.type}] {s.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function StoryProperties() {
  const story = useCanvasStore(s => s.getActiveStory());
  const updateStoryHeight = useCanvasStore(s => s.updateStoryHeight);
  const renameStory = useCanvasStore(s => s.renameStory);

  if (!story) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">楼层设置</span>
      <InputField
        label="楼层名称"
        value={story.name}
        onChange={(v) => renameStory(story.id, v)}
      />
      <InputField
        label="层高"
        value={story.floorToCeilingHeight}
        unit="m"
        type="number"
        step="0.1"
        onChange={(v) => updateStoryHeight(story.id, parseFloat(v) || 3.0)}
      />
      <div className="px-2.5 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-[11px] text-slate-400 dark:text-slate-500 space-y-0.5">
        <div>墙壁数: {story.geometry.edges.length}</div>
        <div>区域数: {story.geometry.faces.length}</div>
        <div>组件数: {story.placements.length}</div>
      </div>
    </div>
  );
}
