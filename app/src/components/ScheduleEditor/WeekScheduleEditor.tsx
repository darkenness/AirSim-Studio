import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Calendar, Tag } from 'lucide-react';
import { EmptyState } from '../ui/empty-state';

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444'];

const DEFAULT_DAY_TYPES: { name: string }[] = [
  { name: '工作日' },
  { name: '周末' },
  { name: '假日' },
];

function DayTypeSection() {
  const { dayTypes, addDayType, updateDayType, removeDayType, schedules } = useAppStore();

  const handleAdd = () => {
    const nextId = dayTypes.length > 0 ? Math.max(...dayTypes.map(d => d.id)) + 1 : 0;
    addDayType({ id: nextId, name: `日类型 ${nextId}`, scheduleId: -1 });
  };

  const handleAddTemplate = (tpl: typeof DEFAULT_DAY_TYPES[0]) => {
    const nextId = dayTypes.length > 0 ? Math.max(...dayTypes.map(d => d.id)) + 1 : 0;
    addDayType({ id: nextId, name: tpl.name, scheduleId: schedules[0]?.id ?? -1 });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Tag size={14} className="text-indigo-500" />
        <span className="text-xs font-bold text-foreground">日类型</span>
        <button onClick={handleAdd} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-indigo-500">
          <Plus size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DEFAULT_DAY_TYPES.map(tpl => (
          <button key={tpl.name} onClick={() => handleAddTemplate(tpl)}
            className="px-2.5 py-1 text-xs font-medium bg-background hover:bg-accent text-foreground rounded-md border border-border transition-colors">
            + {tpl.name}
          </button>
        ))}
      </div>

      {dayTypes.length === 0 && (
        <EmptyState icon={Tag} message="点击上方按钮添加日类型" />
      )}

      {dayTypes.map(dt => (
        <div key={dt.id} className="border border-border rounded-md p-3 flex flex-col gap-2 bg-card">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-indigo-500 font-bold">#{dt.id}</span>
            <input value={dt.name} onChange={e => updateDayType(dt.id, { name: e.target.value })}
              className="flex-1 px-1.5 py-0.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={() => removeDayType(dt.id)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 size={12} />
            </button>
          </div>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-muted-foreground">关联时间表</span>
            <select value={dt.scheduleId} onChange={e => updateDayType(dt.id, { scheduleId: parseInt(e.target.value) })}
              className="px-1.5 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background">
              <option value={-1}>（无）</option>
              {schedules.map(s => <option key={s.id} value={s.id}>{s.name || `时间表 #${s.id}`}</option>)}
            </select>
          </label>
        </div>
      ))}
    </div>
  );
}

function WeekScheduleSection() {
  const { weekSchedules, addWeekSchedule, updateWeekSchedule, removeWeekSchedule, dayTypes } = useAppStore();

  const handleAdd = () => {
    const nextId = weekSchedules.length > 0 ? Math.max(...weekSchedules.map(w => w.id)) + 1 : 0;
    const defaultDayTypeId = dayTypes[0]?.id ?? -1;
    addWeekSchedule({
      id: nextId,
      name: `周计划 ${nextId}`,
      dayTypes: Array(7).fill(defaultDayTypeId),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-emerald-500" />
        <span className="text-xs font-bold text-foreground">周计划</span>
        <button onClick={handleAdd} disabled={dayTypes.length === 0}
          className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-emerald-500 disabled:opacity-30">
          <Plus size={14} />
        </button>
      </div>

      {dayTypes.length === 0 && (
        <EmptyState icon={Calendar} message="请先添加日类型" />
      )}

      {weekSchedules.length === 0 && dayTypes.length > 0 && (
        <EmptyState icon={Calendar} message="尚未添加周计划" actionText="添加周计划" onAction={handleAdd} />
      )}

      {weekSchedules.map(ws => (
        <div key={ws.id} className="border border-border rounded-md bg-card">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50">
            <Calendar size={12} className="text-emerald-500" />
            <input value={ws.name} onChange={e => updateWeekSchedule(ws.id, { name: e.target.value })}
              className="flex-1 px-1.5 py-0.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <span className="text-[9px] text-muted-foreground">#{ws.id}</span>
            <button onClick={() => removeWeekSchedule(ws.id)} className="p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive">
              <Trash2 size={11} />
            </button>
          </div>
          <div className="px-2 py-1.5 flex flex-col gap-1">
            {/* L-25: Visual week preview */}
            <div className="flex gap-0.5 mb-1">
              {DAY_NAMES.map((dayName, dayIdx) => {
                const dtId = ws.dayTypes[dayIdx] ?? -1;
                const dt = dayTypes.find(d => d.id === dtId);
                return (
                  <div key={dayIdx} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full h-3 rounded-sm border border-border/50"
                      style={{ backgroundColor: dt ? DAY_COLORS[dayIdx % DAY_COLORS.length] : 'var(--muted)' }}
                      title={`${dayName}: ${dt?.name ?? '未指定'}`}
                    />
                    <span className="text-[9px] text-muted-foreground leading-none">{dayName.slice(1)}</span>
                  </div>
                );
              })}
            </div>
            {DAY_NAMES.map((dayName, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground w-8">{dayName}</span>
                <select
                  value={ws.dayTypes[dayIdx] ?? -1}
                  onChange={e => {
                    const newDayTypes = [...ws.dayTypes];
                    newDayTypes[dayIdx] = parseInt(e.target.value);
                    updateWeekSchedule(ws.id, { dayTypes: newDayTypes });
                  }}
                  className="flex-1 px-1.5 py-0.5 text-[10px] border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                >
                  <option value={-1}>（未指定）</option>
                  {dayTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WeekScheduleEditor() {
  return (
    <div className="flex flex-col gap-3">
      <DayTypeSection />
      <div className="border-t border-border" />
      <WeekScheduleSection />
    </div>
  );
}
