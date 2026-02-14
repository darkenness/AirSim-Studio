import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, User, Clock } from 'lucide-react';
import type { OccupantZoneAssignment } from '../../types';

export default function OccupantPanel() {
  const { occupants, addOccupant, removeOccupant, updateOccupant, nodes, species, addSource } = useAppStore();
  const rooms = nodes.filter((n) => n.type === 'normal');

  const handleAdd = () => {
    const nextId = occupants.length > 0 ? Math.max(...occupants.map((o) => o.id)) + 1 : 0;
    const firstRoom = rooms[0]?.id ?? -1;
    addOccupant({
      id: nextId,
      name: `人员 ${nextId}`,
      breathingRate: 1.2e-4,  // ~7.2 L/min typical adult
      co2EmissionRate: 4.7e-6, // ~0.017 m³/h CO2
      schedule: firstRoom >= 0
        ? [{ startTime: 0, endTime: 86400, zoneId: firstRoom }]
        : [],
    });

    // Auto-inject CO₂ source if CO₂ species exists
    const co2Species = species.find((s) => s.name === 'CO₂' || s.name === 'CO2');
    if (co2Species && firstRoom >= 0) {
      addSource({
        zoneId: firstRoom,
        speciesId: co2Species.id,
        generationRate: 4.7e-6, // same as co2EmissionRate
        removalRate: 0,
        scheduleId: -1,
        type: 'Constant',
      });
    }
  };

  const updateScheduleEntry = (occId: number, idx: number, patch: Partial<OccupantZoneAssignment>) => {
    const occ = occupants.find((o) => o.id === occId);
    if (!occ) return;
    const newSchedule = [...occ.schedule];
    newSchedule[idx] = { ...newSchedule[idx], ...patch };
    updateOccupant(occId, { schedule: newSchedule });
  };

  const addScheduleEntry = (occId: number) => {
    const occ = occupants.find((o) => o.id === occId);
    if (!occ) return;
    const lastEnd = occ.schedule.length > 0 ? Math.max(...occ.schedule.map((s) => s.endTime)) : 0;
    updateOccupant(occId, {
      schedule: [...occ.schedule, { startTime: lastEnd, endTime: lastEnd + 3600, zoneId: rooms[0]?.id ?? -1 }],
    });
  };

  const removeScheduleEntry = (occId: number, idx: number) => {
    const occ = occupants.find((o) => o.id === occId);
    if (!occ) return;
    updateOccupant(occId, { schedule: occ.schedule.filter((_, i) => i !== idx) });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <User size={14} className="text-indigo-500" />
        <span className="text-xs font-bold text-foreground">人员</span>
        <button
          onClick={handleAdd}
          className="ml-auto p-0.5 rounded hover:bg-indigo-50 text-muted-foreground hover:text-indigo-500"
        >
          <Plus size={14} />
        </button>
      </div>

      {occupants.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          尚未添加人员。点击 + 创建虚拟人员以追踪暴露。
        </p>
      )}

      {occupants.map((occ) => (
        <div key={occ.id} className="border border-border rounded-md p-2 flex flex-col gap-2 bg-card">
          {/* Header */}
          <div className="flex items-center gap-1">
            <User size={12} className="text-indigo-400" />
            <input
              value={occ.name}
              onChange={(e) => updateOccupant(occ.id, { name: e.target.value })}
              className="flex-1 px-1.5 py-0.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-background"
            />
            <button
              onClick={() => removeOccupant(occ.id)}
              className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">呼吸率</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.00001"
                  value={occ.breathingRate}
                  onChange={(e) => updateOccupant(occ.id, { breathingRate: parseFloat(e.target.value) || 1.2e-4 })}
                  className="flex-1 px-1.5 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-background"
                />
                <span className="text-[10px] text-muted-foreground">m³/s</span>
              </div>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted-foreground">CO₂排放</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.000001"
                  value={occ.co2EmissionRate}
                  onChange={(e) => updateOccupant(occ.id, { co2EmissionRate: parseFloat(e.target.value) || 4.7e-6 })}
                  className="flex-1 px-1.5 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-background"
                />
                <span className="text-[10px] text-muted-foreground">kg/s</span>
              </div>
            </label>
          </div>

          {/* Movement Schedule */}
          <div className="border-t border-border pt-1.5">
            <div className="flex items-center gap-1 mb-1">
              <Clock size={11} className="text-teal-500" />
              <span className="text-[11px] font-medium text-muted-foreground">移动时间表</span>
              <button
                onClick={() => addScheduleEntry(occ.id)}
                className="ml-auto p-0.5 rounded hover:bg-teal-50 text-muted-foreground hover:text-teal-500"
              >
                <Plus size={11} />
              </button>
            </div>

            {occ.schedule.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">无时间表条目</p>
            )}

            {occ.schedule.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1 py-0.5 text-[11px]">
                <input
                  type="number"
                  step="60"
                  value={entry.startTime}
                  onChange={(e) => updateScheduleEntry(occ.id, idx, { startTime: parseFloat(e.target.value) || 0 })}
                  title={formatTime(entry.startTime)}
                  className="w-14 px-1 py-0.5 text-[11px] border border-border rounded bg-background text-center"
                />
                <span className="text-muted-foreground">→</span>
                <input
                  type="number"
                  step="60"
                  value={entry.endTime}
                  onChange={(e) => updateScheduleEntry(occ.id, idx, { endTime: parseFloat(e.target.value) || 3600 })}
                  title={formatTime(entry.endTime)}
                  className="w-14 px-1 py-0.5 text-[11px] border border-border rounded bg-background text-center"
                />
                <select
                  value={entry.zoneId}
                  onChange={(e) => updateScheduleEntry(occ.id, idx, { zoneId: parseInt(e.target.value) })}
                  className="flex-1 px-1 py-0.5 text-[11px] border border-border rounded bg-background"
                >
                  <option value={-1}>室外</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeScheduleEntry(occ.id, idx)}
                  className="p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
