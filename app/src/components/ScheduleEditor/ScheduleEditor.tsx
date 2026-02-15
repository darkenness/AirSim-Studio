import { useState } from 'react';
import ReactEChartsCore from 'echarts-for-react';
import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Clock, Copy } from 'lucide-react';
import type { Schedule, SchedulePoint } from '../../types';

const PRESETS: { name: string; points: SchedulePoint[] }[] = [
  {
    name: '工作日 8h',
    points: [
      { time: 0, value: 0 }, { time: 28800, value: 0 }, { time: 29400, value: 1 },
      { time: 61200, value: 1 }, { time: 61800, value: 0 }, { time: 86400, value: 0 },
    ],
  },
  {
    name: '24h 恒定',
    points: [{ time: 0, value: 1 }, { time: 86400, value: 1 }],
  },
  {
    name: '夜间通风',
    points: [
      { time: 0, value: 1 }, { time: 21600, value: 1 }, { time: 22200, value: 0 },
      { time: 72000, value: 0 }, { time: 72600, value: 1 }, { time: 86400, value: 1 },
    ],
  },
];

function ScheduleChart({ points }: { points: SchedulePoint[] }) {
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const option = {
    grid: { top: 10, right: 10, bottom: 25, left: 35 },
    xAxis: {
      type: 'value' as const,
      name: '时间(s)',
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 8, formatter: (v: number) => v >= 3600 ? `${(v / 3600).toFixed(0)}h` : `${v}s` },
      min: sorted[0]?.time ?? 0,
      max: sorted[sorted.length - 1]?.time ?? 3600,
    },
    yAxis: {
      type: 'value' as const,
      name: '值',
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 8 },
      min: 0, max: Math.max(1, ...sorted.map((p) => p.value)) * 1.1,
    },
    series: [{
      type: 'line',
      data: sorted.map((p) => [p.time, p.value]),
      lineStyle: { color: '#3b82f6', width: 2 },
      itemStyle: { color: '#3b82f6' },
      symbolSize: 6,
      areaStyle: { color: 'rgba(59,130,246,0.08)' },
    }],
    animation: false,
  };

  return <ReactEChartsCore option={option} style={{ height: 120 }} notMerge />;
}

function SingleScheduleEditor({ schedule, onUpdate, onDelete }: {
  schedule: Schedule;
  onUpdate: (sch: Schedule) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);

  const updatePoint = (idx: number, field: 'time' | 'value', val: number) => {
    const newPoints = [...schedule.points];
    newPoints[idx] = { ...newPoints[idx], [field]: val };
    onUpdate({ ...schedule, points: newPoints });
  };

  const addPoint = () => {
    const lastTime = schedule.points.length > 0 ? Math.max(...schedule.points.map((p) => p.time)) : 0;
    onUpdate({ ...schedule, points: [...schedule.points, { time: lastTime + 600, value: 1 }] });
  };

  const removePoint = (idx: number) => {
    onUpdate({ ...schedule, points: schedule.points.filter((_, i) => i !== idx) });
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    onUpdate({ ...schedule, points: [...preset.points] });
  };

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50">
        <Clock size={12} className="text-teal-500" />
        {editingName ? (
          <input
            value={schedule.name}
            onChange={(e) => onUpdate({ ...schedule, name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
            autoFocus
            className="flex-1 px-1 py-0 text-xs border border-ring rounded focus:outline-none bg-background text-foreground"
          />
        ) : (
          <span
            className="flex-1 text-xs font-bold text-foreground cursor-pointer hover:text-primary"
            onClick={() => setEditingName(true)}
          >
            {schedule.name || `时间表 #${schedule.id}`}
          </span>
        )}
        <span className="text-[9px] text-muted-foreground">#{schedule.id}</span>
        <button onClick={onDelete} className="p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive">
          <Trash2 size={11} />
        </button>
      </div>

      <ScheduleChart points={schedule.points} />

      <div className="px-2 py-1 flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => applyPreset(p)}
            className="px-1.5 py-0.5 text-[9px] bg-accent hover:bg-primary/10 text-accent-foreground rounded border border-border">
            <Copy size={8} className="inline mr-0.5" />{p.name}
          </button>
        ))}
      </div>

      <div className="px-2 pb-2">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-semibold py-0.5">时间 (s)</th>
              <th className="text-left font-semibold py-0.5">值</th>
              <th className="w-5"></th>
            </tr>
          </thead>
          <tbody>
            {schedule.points.map((pt, idx) => (
              <tr key={idx} className="border-t border-border/50">
                <td className="py-0.5 pr-1">
                  <input type="number" value={pt.time} step="60"
                    onChange={(e) => updatePoint(idx, 'time', parseFloat(e.target.value) || 0)}
                    className="w-full px-1 py-0.5 text-[10px] border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </td>
                <td className="py-0.5 pr-1">
                  <input type="number" value={pt.value} step="0.1" min="0" max="10"
                    onChange={(e) => updatePoint(idx, 'value', parseFloat(e.target.value) || 0)}
                    className="w-full px-1 py-0.5 text-[10px] border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </td>
                <td>
                  <button onClick={() => removePoint(idx)} className="p-0.5 text-muted-foreground hover:text-destructive">
                    <Trash2 size={10} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addPoint}
          className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary">
          <Plus size={10} /> 添加时间点
        </button>
      </div>
    </div>
  );
}

export default function ScheduleEditor() {
  const { schedules, addSchedule } = useAppStore();
  const updateScheduleInStore = (updated: Schedule) => {
    useAppStore.setState((state) => ({
      schedules: state.schedules.map((s) => s.id === updated.id ? updated : s),
    }));
  };
  const removeScheduleFromStore = (id: number) => {
    useAppStore.setState((state) => ({
      schedules: state.schedules.filter((s) => s.id !== id),
      sources: state.sources.map((src) => src.scheduleId === id ? { ...src, scheduleId: -1 } : src),
    }));
  };

  const handleAdd = () => {
    const nextId = schedules.length > 0 ? Math.max(...schedules.map((s) => s.id)) + 1 : 0;
    addSchedule({
      id: nextId,
      name: `时间表 ${nextId}`,
      points: [{ time: 0, value: 0 }, { time: 3600, value: 1 }, { time: 7200, value: 0 }],
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Clock size={14} className="text-teal-500" />
        <span className="text-xs font-bold text-foreground">时间表</span>
        <button onClick={handleAdd} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-teal-500">
          <Plus size={14} />
        </button>
      </div>

      {schedules.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">尚未添加时间表。点击 + 添加。</p>
      )}

      {schedules.map((sch) => (
        <SingleScheduleEditor
          key={sch.id}
          schedule={sch}
          onUpdate={updateScheduleInStore}
          onDelete={() => removeScheduleFromStore(sch.id)}
        />
      ))}
    </div>
  );
}
