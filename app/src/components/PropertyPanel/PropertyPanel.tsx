import { useAppStore } from '../../store/useAppStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { FlowElementType, FlowElementDef } from '../../types';
import { Trash2, Box, Cloud, Link2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import ContaminantPanel from '../ContaminantPanel/ContaminantPanel';
import ModelSummary from '../ModelSummary/ModelSummary';
import ScheduleEditor from '../ScheduleEditor/ScheduleEditor';
import ScheduleGantt from '../ScheduleGantt/ScheduleGantt';
import ControlPanel from '../ControlPanel/ControlPanel';
import OccupantPanel from '../OccupantPanel/OccupantPanel';
import WeatherPanel from '../WeatherPanel/WeatherPanel';
import AHSPanel from '../AHSPanel/AHSPanel';
import FilterPanel from '../FilterPanel/FilterPanel';
import LibraryManager from '../LibraryManager/LibraryManager';
import { ZoneProperties, EdgeProperties, PlacementProperties, StoryProperties } from './ZoneProperties';

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

function NodeProperties() {
  const { nodes, selectedNodeId, updateNode, removeNode } = useAppStore();
  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const isAmbient = node.type === 'ambient';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {isAmbient ? <Cloud size={16} className="text-primary" /> : <Box size={16} className="text-primary" />}
        <span className="text-sm font-bold text-foreground">{isAmbient ? '室外环境节点' : '房间 / 区域'}</span>
        <button
          onClick={() => removeNode(node.id)}
          className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <InputField label="名称" value={node.name} onChange={(v) => updateNode(node.id, { name: v })} />
      <InputField
        label="温度" value={node.temperature} unit="K" type="number" step="0.1"
        onChange={(v) => updateNode(node.id, { temperature: parseFloat(v) || 0 })}
      />
      <InputField
        label="标高" value={node.elevation} unit="m" type="number" step="0.1"
        onChange={(v) => updateNode(node.id, { elevation: parseFloat(v) || 0 })}
      />

      {!isAmbient && (
        <>
          <InputField
            label="体积" value={node.volume} unit="m³" type="number" step="1"
            onChange={(v) => updateNode(node.id, { volume: parseFloat(v) || 0 })}
          />
          <InputField
            label="楼层" value={node.level ?? 0} type="number" step="1"
            onChange={(v) => updateNode(node.id, { level: parseInt(v) || 0 })}
          />
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={node.isShaft ?? false}
              onChange={(e) => updateNode(node.id, { isShaft: e.target.checked })}
              className="rounded border-border"
            />
            竖井 / 楼梯间（跨楼层）
          </label>
        </>
      )}

      <div className="mt-1 px-2 py-1.5 bg-muted rounded text-[11px] text-muted-foreground">
        ID: {node.id} &nbsp;|&nbsp; 类型: {node.type} &nbsp;|&nbsp; 位置: ({node.x}, {node.y})
      </div>
    </div>
  );
}

function LinkProperties() {
  const { links, selectedLinkId, updateLink, removeLink, nodes } = useAppStore();
  const link = links.find((l) => l.id === selectedLinkId);
  if (!link) return null;

  const fromNode = nodes.find((n) => n.id === link.from);
  const toNode = nodes.find((n) => n.id === link.to);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-primary" />
        <span className="text-sm font-bold text-foreground">气流路径</span>
        <button
          onClick={() => removeLink(link.id)}
          className="ml-auto p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
        {fromNode?.name ?? `#${link.from}`} → {toNode?.name ?? `#${link.to}`}
      </div>

      <InputField
        label="路径标高 (Z_k)" value={link.elevation} unit="m" type="number" step="0.1"
        onChange={(v) => updateLink(link.id, { elevation: parseFloat(v) || 0 })}
      />

      <div className="border-t border-border pt-2 mt-1">
        <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">气流元件</span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">类型</span>
          <select
            value={link.element.type}
            onChange={(e) => {
              const newType = e.target.value as FlowElementType;
              const defaults: Record<string, FlowElementDef> = {
                PowerLawOrifice: { type: 'PowerLawOrifice', C: 0.001, n: 0.65 },
                TwoWayFlow: { type: 'TwoWayFlow', Cd: 0.65, area: 0.5 },
                Fan: { type: 'Fan', maxFlow: 0.05, shutoffPressure: 200 },
                Duct: { type: 'Duct', length: 5.0, diameter: 0.2, roughness: 0.0001, sumK: 0 },
                Damper: { type: 'Damper', Cmax: 0.005, n: 0.65, fraction: 1.0 },
                Filter: { type: 'Filter', C: 0.002, n: 0.65, efficiency: 0.9 },
                SelfRegulatingVent: { type: 'SelfRegulatingVent', targetFlow: 0.01, pMin: 2.0, pMax: 50.0 },
                CheckValve: { type: 'CheckValve', C: 0.001, n: 0.65 },
                SupplyDiffuser: { type: 'SupplyDiffuser', C: 0.003, n: 0.5 },
                ReturnGrille: { type: 'ReturnGrille', C: 0.003, n: 0.5 },
              };
              updateLink(link.id, { element: defaults[newType] ?? { type: newType } });
            }}
            className="px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring bg-background"
          >
            <option value="PowerLawOrifice">幂律孔口模型</option>
            <option value="TwoWayFlow">大开口 (双向流)</option>
            <option value="Fan">风扇 / 风机</option>
            <option value="Duct">风管 / 管道</option>
            <option value="Damper">阀门 / 风阀</option>
            <option value="Filter">过滤器</option>
            <option value="SelfRegulatingVent">自调节通风口</option>
            <option value="CheckValve">单向阀</option>
            <option value="SupplyDiffuser">送风口</option>
            <option value="ReturnGrille">回风口</option>
          </select>
        </label>

        {link.element.type === 'PowerLawOrifice' && (
          <>
            <InputField
              label="流动系数 (C)" value={link.element.C ?? 0.001} type="number" step="0.0001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, C: parseFloat(v) || 0.001 }
              })}
            />
            <InputField
              label="流动指数 (n)" value={link.element.n ?? 0.65} type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, n: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0.65)) }
              })}
            />
          </>
        )}

        {link.element.type === 'TwoWayFlow' && (
          <>
            <InputField
              label="流量系数 (Cd)" value={link.element.Cd ?? 0.65} type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, Cd: Math.max(0.01, parseFloat(v) || 0.65) }
              })}
            />
            <InputField
              label="开口面积" value={link.element.area ?? 0.5} unit="m²" type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, area: Math.max(0.001, parseFloat(v) || 0.5) }
              })}
            />
          </>
        )}

        {link.element.type === 'Fan' && (
          <>
            <InputField
              label="最大风量" value={link.element.maxFlow ?? 0.05} unit="m³/s" type="number" step="0.001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, maxFlow: Math.max(0.001, parseFloat(v) || 0.05) }
              })}
            />
            <InputField
              label="全压截止" value={link.element.shutoffPressure ?? 200} unit="Pa" type="number" step="10"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, shutoffPressure: Math.max(1, parseFloat(v) || 200) }
              })}
            />
          </>
        )}

        {link.element.type === 'Duct' && (
          <>
            <InputField
              label="管道长度" value={link.element.length ?? 5} unit="m" type="number" step="0.5"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, length: Math.max(0.1, parseFloat(v) || 5) }
              })}
            />
            <InputField
              label="水力直径" value={link.element.diameter ?? 0.2} unit="m" type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, diameter: Math.max(0.01, parseFloat(v) || 0.2) }
              })}
            />
            <InputField
              label="表面粗糙度" value={link.element.roughness ?? 0.0001} unit="m" type="number" step="0.00001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, roughness: Math.max(0, parseFloat(v) || 0.0001) }
              })}
            />
            <InputField
              label="局部损失 (ΣK)" value={link.element.sumK ?? 0} type="number" step="0.5"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, sumK: Math.max(0, parseFloat(v) || 0) }
              })}
            />
          </>
        )}

        {link.element.type === 'Damper' && (
          <>
            <InputField
              label="最大流量系数 (Cmax)" value={link.element.Cmax ?? 0.005} type="number" step="0.001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, Cmax: Math.max(0.0001, parseFloat(v) || 0.005) }
              })}
            />
            <InputField
              label="流动指数 (n)" value={link.element.n ?? 0.65} type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, n: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0.65)) }
              })}
            />
            <InputField
              label="开度 (0~1)" value={link.element.fraction ?? 1.0} type="number" step="0.1"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, fraction: Math.max(0, Math.min(1, parseFloat(v) || 1)) }
              })}
            />
          </>
        )}

        {link.element.type === 'Filter' && (
          <>
            <InputField
              label="流动系数 (C)" value={link.element.C ?? 0.002} type="number" step="0.0001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, C: Math.max(0.0001, parseFloat(v) || 0.002) }
              })}
            />
            <InputField
              label="流动指数 (n)" value={link.element.n ?? 0.65} type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, n: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0.65)) }
              })}
            />
            <InputField
              label="去除效率 (0~1)" value={link.element.efficiency ?? 0.9} type="number" step="0.05"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, efficiency: Math.max(0, Math.min(1, parseFloat(v) || 0.9)) }
              })}
            />
          </>
        )}

        {link.element.type === 'SelfRegulatingVent' && (
          <>
            <InputField
              label="目标流量 (m³/s)" value={link.element.targetFlow ?? 0.01} type="number" step="0.001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, targetFlow: Math.max(0.0001, parseFloat(v) || 0.01) }
              })}
            />
            <InputField
              label="最小调节压力 (Pa)" value={link.element.pMin ?? 2.0} type="number" step="0.5"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, pMin: Math.max(0.1, parseFloat(v) || 2.0) }
              })}
            />
            <InputField
              label="最大调节压力 (Pa)" value={link.element.pMax ?? 50.0} type="number" step="1"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, pMax: Math.max(1.0, parseFloat(v) || 50.0) }
              })}
            />
          </>
        )}

        {link.element.type === 'CheckValve' && (
          <>
            <InputField
              label="流动系数 (C)" value={link.element.C ?? 0.001} type="number" step="0.0001"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, C: Math.max(0.0001, parseFloat(v) || 0.001) }
              })}
            />
            <InputField
              label="流动指数 (n)" value={link.element.n ?? 0.65} type="number" step="0.01"
              onChange={(v) => updateLink(link.id, {
                element: { ...link.element, n: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0.65)) }
              })}
            />
          </>
        )}
      </div>

      {/* Schedule binding */}
      {['Fan', 'Damper', 'Filter', 'SelfRegulatingVent'].includes(link.element.type) && (
        <div className="border-t border-border pt-2 mt-1">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">绑定排程</span>
            <select
              value={link.scheduleId ?? -1}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                updateLink(link.id, { scheduleId: val === -1 ? undefined : val });
              }}
              className="px-2 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring bg-background"
            >
              <option value={-1}>无排程（常开）</option>
              {useAppStore.getState().schedules.map((sch) => (
                <option key={sch.id} value={sch.id}>{sch.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-1 px-2 py-1.5 bg-muted rounded text-[10px] text-muted-foreground">
        ID: {link.id}
      </div>
    </div>
  );
}

function AmbientSettings() {
  const { ambientTemperature, windSpeed, windDirection, setAmbient } = useAppStore();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-bold text-foreground">室外环境条件</span>
      <InputField
        label="温度" value={ambientTemperature} unit="K" type="number" step="0.1"
        onChange={(v) => setAmbient({ ambientTemperature: parseFloat(v) || 283.15 })}
      />
      <InputField
        label="风速" value={windSpeed} unit="m/s" type="number" step="0.1"
        onChange={(v) => setAmbient({ windSpeed: parseFloat(v) || 0 })}
      />
      <InputField
        label="风向" value={windDirection} unit="°" type="number" step="1"
        onChange={(v) => setAmbient({ windDirection: parseFloat(v) || 0 })}
      />
    </div>
  );
}

export default function PropertyPanel() {
  const { selectedNodeId, selectedLinkId } = useAppStore();
  const selectedFaceId = useCanvasStore(s => s.selectedFaceId);
  const selectedEdgeId = useCanvasStore(s => s.selectedEdgeId);
  const selectedPlacementId = useCanvasStore(s => s.selectedPlacementId);

  const hasOldSelection = selectedNodeId !== null || selectedLinkId !== null;
  const hasCanvasSelection = selectedFaceId !== null || selectedEdgeId !== null || selectedPlacementId !== null;
  const hasSelection = hasOldSelection || hasCanvasSelection;

  return (
    <aside className="bg-card flex flex-col h-full overflow-hidden pt-12">
      {hasSelection ? (
        <div className="flex flex-col h-full">
          <div className="px-4 py-2.5 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">属性</h2>
          </div>
          <div className="px-4 py-3 flex-1 overflow-y-auto">
            {selectedPlacementId !== null ? <PlacementProperties /> :
             selectedFaceId !== null ? <ZoneProperties /> :
             selectedEdgeId !== null ? <EdgeProperties /> :
             selectedNodeId !== null ? <NodeProperties /> :
             <LinkProperties />}
          </div>
        </div>
      ) : (
        <Tabs defaultValue="model" className="flex flex-col h-full">
          <div className="px-3 pt-2 pb-1 border-b border-border shrink-0">
            <TabsList className="w-full h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="model" className="text-[11px] px-2.5 py-1">模型</TabsTrigger>
              <TabsTrigger value="contam" className="text-[11px] px-2.5 py-1">污染物</TabsTrigger>
              <TabsTrigger value="schedule" className="text-[11px] px-2.5 py-1">排程</TabsTrigger>
              <TabsTrigger value="control" className="text-[11px] px-2.5 py-1">控制</TabsTrigger>
              <TabsTrigger value="occupant" className="text-[11px] px-2.5 py-1">人员</TabsTrigger>
              <TabsTrigger value="weather" className="text-[11px] px-2.5 py-1">气象</TabsTrigger>
              <TabsTrigger value="ahs" className="text-[11px] px-2.5 py-1">空调</TabsTrigger>
              <TabsTrigger value="filter" className="text-[11px] px-2.5 py-1">过滤器</TabsTrigger>
              <TabsTrigger value="library" className="text-[11px] px-2.5 py-1">库管理</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <TabsContent value="model" className="mt-0">
              <div className="flex flex-col gap-4">
                <StoryProperties />
                <div className="border-t border-border" />
                <AmbientSettings />
                <div className="border-t border-border" />
                <ModelSummary />
              </div>
            </TabsContent>
            <TabsContent value="contam" className="mt-0">
              <ContaminantPanel />
            </TabsContent>
            <TabsContent value="schedule" className="mt-0">
              <ScheduleEditor />
              <ScheduleGantt />
            </TabsContent>
            <TabsContent value="control" className="mt-0">
              <ControlPanel />
            </TabsContent>
            <TabsContent value="occupant" className="mt-0">
              <OccupantPanel />
            </TabsContent>
            <TabsContent value="weather" className="mt-0">
              <WeatherPanel />
            </TabsContent>
            <TabsContent value="ahs" className="mt-0">
              <AHSPanel />
            </TabsContent>
            <TabsContent value="filter" className="mt-0">
              <FilterPanel />
            </TabsContent>
            <TabsContent value="library" className="mt-0">
              <LibraryManager />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </aside>
  );
}
