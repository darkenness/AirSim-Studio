import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Wind } from 'lucide-react';
import type { AHSZoneConnection } from '../../types';
import { useMergedRooms } from '../../hooks/useMergedRooms';
import { InputField } from '../ui/input-field';
import { EmptyState } from '../ui/empty-state';

function ZoneConnectionEditor({ connections, onChange, label }: {
  connections: AHSZoneConnection[];
  onChange: (conns: AHSZoneConnection[]) => void;
  label: string;
}) {
  // M-14: Use merged room list (legacy + canvas)
  const zones = useMergedRooms();

  const addConnection = () => {
    const firstZone = zones[0];
    if (!firstZone) return;
    onChange([...connections, { zoneId: firstZone.id, fraction: 1.0 }]);
  };

  const removeConnection = (idx: number) => {
    onChange(connections.filter((_, i) => i !== idx));
  };

  const updateConnection = (idx: number, patch: Partial<AHSZoneConnection>) => {
    onChange(connections.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <button onClick={addConnection} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground">
          <Plus size={12} />
        </button>
      </div>
      {connections.map((conn, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            value={conn.zoneId}
            onChange={(e) => updateConnection(i, { zoneId: parseInt(e.target.value) })}
            className="flex-1 px-1 py-0.5 text-[11px] border border-border rounded bg-background"
          >
            {zones.map(z => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
          <input
            type="number"
            value={conn.fraction}
            step="0.1"
            min="0"
            max="1"
            onChange={(e) => updateConnection(i, { fraction: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
            className="w-14 px-1 py-0.5 text-[11px] border border-border rounded bg-background text-right"
          />
          <button onClick={() => removeConnection(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {connections.length === 0 && (
        <span className="text-[11px] text-muted-foreground italic">无连接区域</span>
      )}
    </div>
  );
}

export default function AHSPanel() {
  const { ahsSystems, addAHS, updateAHS, removeAHS, schedules } = useAppStore();

  const handleAdd = () => {
    const nextId = ahsSystems.length > 0 ? Math.max(...ahsSystems.map(a => a.id)) + 1 : 0;
    addAHS({
      id: nextId,
      name: `空调系统 ${nextId + 1}`,
      supplyFlow: 0.1,
      returnFlow: 0.1,
      outdoorAirFlow: 0.02,
      exhaustFlow: 0.02,
      supplyTemperature: 295.15,
      supplyZones: [],
      returnZones: [],
      outdoorAirScheduleId: -1,
      supplyFlowScheduleId: -1,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Wind size={14} className="text-emerald-500" />
        <span className="text-xs font-bold text-foreground">空调系统 (AHS)</span>
        <button
          onClick={handleAdd}
          className="ml-auto p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-muted-foreground hover:text-emerald-500"
        >
          <Plus size={14} />
        </button>
      </div>

      {ahsSystems.length === 0 && (
        <EmptyState icon={Wind} message="尚未添加空调系统" actionText="添加 AHS" onAction={handleAdd} />
      )}

      {ahsSystems.map((ahs) => (
        <div key={ahs.id} className="flex flex-col gap-2.5 p-3 border border-border rounded-lg">
          {/* Header */}
          <div className="flex items-center gap-2">
            <input
              value={ahs.name}
              onChange={(e) => updateAHS(ahs.id, { name: e.target.value })}
              className="flex-1 px-1.5 py-0.5 text-xs font-semibold border border-transparent hover:border-border rounded bg-transparent focus:outline-none focus:border-ring"
            />
            <button
              onClick={() => removeAHS(ahs.id)}
              className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Flow rates */}
          <div className="grid grid-cols-2 gap-2">
            <InputField label="送风量" value={ahs.supplyFlow} unit="m³/s" type="number" step="0.01"
              onChange={(v) => updateAHS(ahs.id, { supplyFlow: Math.max(0, parseFloat(v) || 0) })} />
            <InputField label="回风量" value={ahs.returnFlow} unit="m³/s" type="number" step="0.01"
              onChange={(v) => updateAHS(ahs.id, { returnFlow: Math.max(0, parseFloat(v) || 0) })} />
            <InputField label="新风量" value={ahs.outdoorAirFlow} unit="m³/s" type="number" step="0.005"
              onChange={(v) => updateAHS(ahs.id, { outdoorAirFlow: Math.max(0, parseFloat(v) || 0) })} />
            <InputField label="排风量" value={ahs.exhaustFlow} unit="m³/s" type="number" step="0.005"
              onChange={(v) => updateAHS(ahs.id, { exhaustFlow: Math.max(0, parseFloat(v) || 0) })} />
          </div>

          <InputField label="送风温度" value={+(ahs.supplyTemperature - 273.15).toFixed(2)} unit="°C" type="number" step="0.5"
            onChange={(v) => updateAHS(ahs.id, { supplyTemperature: Math.max(250, Math.min(350, (parseFloat(v) || 0) + 273.15)) })} />

          {/* Zone connections */}
          <ZoneConnectionEditor
            label="送风区域"
            connections={ahs.supplyZones}
            onChange={(conns) => updateAHS(ahs.id, { supplyZones: conns })}
          />
          <ZoneConnectionEditor
            label="回风区域"
            connections={ahs.returnZones}
            onChange={(conns) => updateAHS(ahs.id, { returnZones: conns })}
          />

          {/* Schedule bindings */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider">送风排程</span>
              <select
                value={ahs.supplyFlowScheduleId}
                onChange={(e) => updateAHS(ahs.id, { supplyFlowScheduleId: parseInt(e.target.value) })}
                className="px-1 py-0.5 text-[11px] border border-border rounded bg-background"
              >
                <option value={-1}>常量</option>
                {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-muted-foreground tracking-wider">新风排程</span>
              <select
                value={ahs.outdoorAirScheduleId}
                onChange={(e) => updateAHS(ahs.id, { outdoorAirScheduleId: parseInt(e.target.value) })}
                className="px-1 py-0.5 text-[11px] border border-border rounded bg-background"
              >
                <option value={-1}>常量</option>
                {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          {/* Balance check */}
          {Math.abs(ahs.supplyFlow - ahs.returnFlow) > 0.001 && (
            <div className="px-2 py-1 bg-amber-50 dark:bg-amber-950/30 rounded text-[11px] text-amber-600 dark:text-amber-400">
              送风量 ≠ 回风量（差值: {(ahs.supplyFlow - ahs.returnFlow).toFixed(4)} m³/s）
            </div>
          )}

          {/* OA fraction display */}
          <div className="px-2 py-1 bg-muted rounded text-[11px] text-muted-foreground">
            新风比: {ahs.supplyFlow > 0 ? ((ahs.outdoorAirFlow / ahs.supplyFlow) * 100).toFixed(1) : 0}%
            &nbsp;|&nbsp; 回风: {(ahs.supplyFlow - ahs.outdoorAirFlow).toFixed(4)} m³/s
          </div>
        </div>
      ))}
    </div>
  );
}
