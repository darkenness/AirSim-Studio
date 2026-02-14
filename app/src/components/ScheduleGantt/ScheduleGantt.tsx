import { useAppStore } from '../../store/useAppStore';

const HOUR_WIDTH = 40; // pixels per hour
const ROW_HEIGHT = 24;
const LABEL_WIDTH = 80;

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const BAR_COLORS = ['#3b82f6', '#8b5cf6', '#059669', '#d97706', '#dc2626', '#0891b2', '#be185d', '#6366f1'];

export default function ScheduleGantt() {
  const { schedules } = useAppStore();

  if (schedules.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        尚未创建排程。在"排程"标签页中添加时间表后，这里将显示甘特图概览。
      </div>
    );
  }

  // Find global time range
  let minTime = Infinity;
  let maxTime = -Infinity;
  schedules.forEach((sch) => {
    sch.points.forEach((p) => {
      if (p.time < minTime) minTime = p.time;
      if (p.time > maxTime) maxTime = p.time;
    });
  });
  if (!isFinite(minTime)) { minTime = 0; maxTime = 86400; }
  const totalHours = Math.ceil((maxTime - minTime) / 3600) || 24;
  const totalWidth = LABEL_WIDTH + totalHours * HOUR_WIDTH;

  // Build hour markers
  const hourMarkers: number[] = [];
  for (let h = 0; h <= totalHours; h++) {
    hourMarkers.push(h);
  }

  return (
    <div className="mt-2 border border-border rounded-md overflow-x-auto bg-card">
      <div className="text-xs font-semibold text-foreground px-2 py-1.5 border-b border-border">
        排程甘特图
      </div>
      <div style={{ minWidth: totalWidth }} className="relative">
        {/* Hour grid header */}
        <div className="flex border-b border-border" style={{ height: 20 }}>
          <div style={{ width: LABEL_WIDTH }} className="shrink-0 px-1 text-[10px] text-muted-foreground flex items-center">名称</div>
          {hourMarkers.map((h) => (
            <div
              key={h}
              style={{ width: HOUR_WIDTH }}
              className="shrink-0 text-[9px] text-muted-foreground flex items-center justify-center border-l border-border/50"
            >
              {formatTime(minTime + h * 3600)}
            </div>
          ))}
        </div>

        {/* Schedule rows */}
        {schedules.map((sch, idx) => {
          // Find active segments (value > 0)
          const sorted = [...sch.points].sort((a, b) => a.time - b.time);
          const segments: { start: number; end: number }[] = [];
          for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].value > 0) {
              segments.push({ start: sorted[i].time, end: sorted[i + 1].time });
            }
          }

          return (
            <div key={sch.id} className="flex border-b border-border/50 relative" style={{ height: ROW_HEIGHT }}>
              <div
                style={{ width: LABEL_WIDTH }}
                className="shrink-0 px-1 text-[10px] text-foreground flex items-center truncate"
                title={sch.name}
              >
                {sch.name}
              </div>
              <div className="flex-1 relative">
                {/* Hour grid lines */}
                {hourMarkers.map((h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: h * HOUR_WIDTH }}
                  />
                ))}
                {/* Active segments as bars */}
                {segments.map((seg, si) => {
                  const left = ((seg.start - minTime) / 3600) * HOUR_WIDTH;
                  const width = ((seg.end - seg.start) / 3600) * HOUR_WIDTH;
                  return (
                    <div
                      key={si}
                      className="absolute top-1 rounded-sm"
                      style={{
                        left,
                        width: Math.max(width, 2),
                        height: ROW_HEIGHT - 8,
                        backgroundColor: BAR_COLORS[idx % BAR_COLORS.length],
                        opacity: 0.8,
                      }}
                      title={`${sch.name}: ${formatTime(seg.start)} → ${formatTime(seg.end)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
