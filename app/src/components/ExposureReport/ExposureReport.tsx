import { useAppStore } from '../../store/useAppStore';
import { ShieldAlert, Download } from 'lucide-react';
import { toast } from '../../hooks/use-toast';

export default function ExposureReport() {
  const { transientResult, occupants, nodes } = useAppStore();

  if (!transientResult || !transientResult.timeSeries || transientResult.timeSeries.length < 2) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p>暴露报告需要瞬态仿真结果。请先运行瞬态仿真。</p>
      </div>
    );
  }

  const { timeSeries, species, nodes: resultNodes } = transientResult;
  const dt = timeSeries.length > 1 ? timeSeries[1].time - timeSeries[0].time : 60;
  const totalTime = timeSeries[timeSeries.length - 1].time - timeSeries[0].time;

  // Build node index map: nodeId → index in timeSeries arrays
  const nodeIdxMap = new Map<number, number>();
  resultNodes.forEach((nd, idx) => { nodeIdxMap.set(nd.id, idx); });

  // For each occupant, compute exposure per species
  interface ExposureEntry {
    occupantName: string;
    speciesName: string;
    cumulativeDose: number;  // kg (inhaled mass)
    peakConc: number;        // kg/m³
    twa: number;             // kg/m³ (time-weighted average)
  }

  const entries: ExposureEntry[] = [];

  // If no occupants defined, compute for all non-ambient zones (default occupant)
  const effectiveOccupants = occupants.length > 0
    ? occupants
    : nodes.filter(n => n.type === 'normal').map((n, i) => ({
        id: i,
        name: `${n.name} (默认)`,
        breathingRate: 1.2e-4,
        co2EmissionRate: 0,
        schedule: [{ startTime: 0, endTime: totalTime + dt, zoneId: n.id }],
      }));

  effectiveOccupants.forEach((occ) => {
    species.forEach((sp, spIdx) => {
      let cumulativeDose = 0;
      let peakConc = 0;
      let totalExposure = 0;
      let exposureTime = 0;

      timeSeries.forEach((ts) => {
        // Find which zone the occupant is in at this time
        const assignment = occ.schedule.find(
          (a) => ts.time >= a.startTime && ts.time < a.endTime
        );
        if (!assignment || assignment.zoneId < 0) return; // outside building

        const nodeIdx = nodeIdxMap.get(assignment.zoneId);
        if (nodeIdx === undefined) return;

        const conc = ts.concentrations?.[nodeIdx]?.[spIdx] ?? 0;
        cumulativeDose += conc * occ.breathingRate * dt;
        peakConc = Math.max(peakConc, conc);
        totalExposure += conc * dt;
        exposureTime += dt;
      });

      const twa = exposureTime > 0 ? totalExposure / exposureTime : 0;

      entries.push({
        occupantName: occ.name,
        speciesName: sp.name,
        cumulativeDose,
        peakConc,
        twa,
      });
    });
  });

  const handleExportCSV = () => {
    const header = '人员,污染物,累积吸入量(kg),峰值浓度(kg/m³),时间加权平均(kg/m³)';
    const rows = entries.map(e =>
      `${e.occupantName},${e.speciesName},${e.cumulativeDose.toExponential(4)},${e.peakConc.toExponential(4)},${e.twa.toExponential(4)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'exposure_report.csv'; a.click();
    URL.revokeObjectURL(url);
    toast({ title: '已导出', description: 'exposure_report.csv' });
  };

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p>无暴露数据。请确保已定义人员或区域。</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-amber-500" />
        <span className="text-sm font-semibold text-foreground">人员暴露报告</span>
        <span className="text-xs text-muted-foreground">
          仿真时长: {(totalTime / 60).toFixed(0)} min · {effectiveOccupants.length} 人 · {species.length} 种污染物
        </span>
        <div className="flex-1" />
        <button onClick={handleExportCSV} className="p-1 hover:bg-accent rounded" title="导出暴露报告CSV">
          <Download size={13} className="text-muted-foreground" />
        </button>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px] text-muted-foreground border-b border-border">
            <th className="text-left pr-3 py-1.5 font-semibold">人员</th>
            <th className="text-left pr-3 py-1.5 font-semibold">污染物</th>
            <th className="text-right pr-3 py-1.5 font-semibold">累积吸入量</th>
            <th className="text-right pr-3 py-1.5 font-semibold">峰值浓度</th>
            <th className="text-right py-1.5 font-semibold">TWA</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, idx) => (
            <tr key={idx} className="border-b border-border/50">
              <td className="py-1 pr-3 text-foreground font-medium">{e.occupantName}</td>
              <td className="py-1 pr-3 text-purple-600">{e.speciesName}</td>
              <td className="py-1 pr-3 text-right font-mono text-foreground">
                {e.cumulativeDose > 0 ? e.cumulativeDose.toExponential(3) : '0'} <span className="text-muted-foreground">kg</span>
              </td>
              <td className="py-1 pr-3 text-right font-mono text-amber-600">
                {e.peakConc > 0 ? e.peakConc.toExponential(3) : '0'} <span className="text-muted-foreground">kg/m³</span>
              </td>
              <td className="py-1 text-right font-mono text-blue-600">
                {e.twa > 0 ? e.twa.toExponential(3) : '0'} <span className="text-muted-foreground">kg/m³</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
