import ReactEChartsCore from 'echarts-for-react';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { X, TrendingUp, Download } from 'lucide-react';
import { toast } from '../../hooks/use-toast';

type ConcUnit = 'kg/m³' | 'mg/m³' | 'μg/m³' | 'ppm';

const CONC_UNITS: { value: ConcUnit; label: string }[] = [
  { value: 'kg/m³', label: 'kg/m³' },
  { value: 'mg/m³', label: 'mg/m³' },
  { value: 'μg/m³', label: 'μg/m³' },
  { value: 'ppm', label: 'ppm' },
];

// Convert kg/m³ to target unit. ppm uses molarMass (kg/mol); if 0 treat as particulate (use mg/m³ equivalent)
function convertConc(kgm3: number, unit: ConcUnit, molarMass: number): number {
  switch (unit) {
    case 'kg/m³': return kgm3;
    case 'mg/m³': return kgm3 * 1e6;
    case 'μg/m³': return kgm3 * 1e9;
    case 'ppm':
      if (molarMass > 0) return (kgm3 / molarMass) * 8.314 * 293.15 / 101325 * 1e6;
      return kgm3 * 1e6; // fallback to mg/m³ for particles
  }
}

// Safety reference lines per species (in kg/m³). Name → { value_kg, label }
const SAFETY_REFS: Record<string, { value: number; label: string; color: string }[]> = {
  'CO₂': [{ value: 1.8e-3, label: 'CO₂ 1000ppm', color: '#ef4444' }],
  'CO':  [{ value: 2.86e-2, label: 'CO 25ppm(8h)', color: '#ef4444' }],
  'HCHO': [{ value: 1.0e-4, label: '甲醛 0.08mg/m³', color: '#ef4444' }],
  'PM2.5': [{ value: 7.5e-5, label: 'PM2.5 75μg/m³', color: '#ef4444' }, { value: 3.5e-5, label: 'PM2.5 35μg/m³', color: '#f59e0b' }],
};

export default function TransientChart() {
  const { transientResult, setTransientResult } = useAppStore();
  const [concUnit, setConcUnit] = useState<ConcUnit>('kg/m³');

  if (!transientResult) return null;

  const { timeSeries, nodes, species } = transientResult;
  if (!timeSeries || timeSeries.length === 0) return null;

  const timeData = timeSeries.map((ts) => (ts.time / 60).toFixed(1));
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#6366f1', '#0891b2', '#be185d'];

  // Build concentration series with unit conversion
  const concSeries: { name: string; data: number[]; type: 'line' }[] = [];
  nodes.forEach((node, nodeIdx) => {
    if (node.type === 'ambient') return;
    species.forEach((sp, spIdx) => {
      const data = timeSeries.map((ts) => {
        const raw = ts.concentrations?.[nodeIdx]?.[spIdx] ?? 0;
        return convertConc(raw, concUnit, sp.molarMass);
      });
      concSeries.push({ name: `${node.name} - ${sp.name}`, data, type: 'line' });
    });
  });

  // Build safety reference markLines
  const markLines: { yAxis: number; name: string; lineStyle: { color: string; type: string } }[] = [];
  species.forEach((sp) => {
    const refs = SAFETY_REFS[sp.name];
    if (!refs) return;
    refs.forEach((ref) => {
      markLines.push({
        yAxis: convertConc(ref.value, concUnit, sp.molarMass),
        name: ref.label,
        lineStyle: { color: ref.color, type: 'dashed' },
      });
    });
  });

  // Pressure series
  const pressureSeries: { name: string; data: number[]; type: 'line' }[] = [];
  nodes.forEach((node, nodeIdx) => {
    if (node.type === 'ambient') return;
    const data = timeSeries.map((ts) => ts.airflow?.pressures?.[nodeIdx] ?? 0);
    pressureSeries.push({ name: `${node.name} 压力`, data, type: 'line' });
  });

  const unitLabel = concUnit;
  const yAxisFormatter = (v: number) => {
    if (concUnit === 'kg/m³') return v.toExponential(1);
    if (concUnit === 'ppm') return v < 10 ? v.toFixed(1) : v.toFixed(0);
    return v < 1 ? v.toFixed(2) : v < 1000 ? v.toFixed(0) : v.toExponential(1);
  };

  const concOption: Record<string, unknown> = {
    title: { text: '污染物浓度', textStyle: { fontSize: 12, color: '#334155' }, left: 10, top: 5 },
    tooltip: { trigger: 'axis', textStyle: { fontSize: 11 } },
    legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    grid: { top: 35, right: 20, bottom: 30, left: 65 },
    dataZoom: [{ type: 'inside', xAxisIndex: 0 }],
    xAxis: { type: 'category', data: timeData, name: '时间 (min)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value', name: `浓度 (${unitLabel})`, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9, formatter: yAxisFormatter } },
    color: colors,
    series: concSeries.map((s, i) => ({
      ...s,
      ...(i === 0 && markLines.length > 0 ? {
        markLine: {
          silent: true,
          symbol: 'none',
          data: markLines.map((ml) => ({ yAxis: ml.yAxis, name: ml.name, lineStyle: ml.lineStyle, label: { formatter: ml.name, fontSize: 9, position: 'insideEndTop' } })),
        },
      } : {}),
    })),
    animation: false,
  };

  const pressureOption = {
    title: { text: '节点压力', textStyle: { fontSize: 12, color: '#334155' }, left: 10, top: 5 },
    tooltip: { trigger: 'axis' as const, textStyle: { fontSize: 11 } },
    legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    grid: { top: 35, right: 20, bottom: 30, left: 55 },
    dataZoom: [{ type: 'inside' as const, xAxisIndex: 0 }],
    xAxis: { type: 'category' as const, data: timeData, name: '时间 (min)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value' as const, name: '压力 (Pa)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    color: colors.slice(3),
    series: pressureSeries,
    animation: false,
  };

  const handleExportCSV = () => {
    const nonAmbient = nodes.filter(nd => nd.type !== 'ambient');
    const header = [
      '时间(s)',
      ...nonAmbient.map(nd => `${nd.name}_压力(Pa)`),
      ...nonAmbient.flatMap(nd => species.map(sp => `${nd.name}_${sp.name}(kg/m³)`)),
    ].join(',');
    const rows = timeSeries.map(ts => {
      const vals = [ts.time.toString()];
      nodes.forEach((nd, ni) => {
        if (nd.type === 'ambient') return;
        vals.push((ts.airflow?.pressures?.[ni] ?? 0).toFixed(4));
      });
      nodes.forEach((nd, ni) => {
        if (nd.type === 'ambient') return;
        species.forEach((_, si) => {
          vals.push((ts.concentrations?.[ni]?.[si] ?? 0).toExponential(6));
        });
      });
      return vals.join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transient_results.csv'; a.click();
    URL.revokeObjectURL(url);
    toast({ title: '已导出', description: 'transient_results.csv' });
  };

  return (
    <div className="bg-card shrink-0">
      <div className="flex items-center px-4 py-1.5 gap-2 border-b border-border">
        <TrendingUp size={14} className="text-teal-500" />
        <span className="text-xs font-bold text-foreground">瞬态仿真结果</span>
        <span className="text-[10px] text-muted-foreground">
          {transientResult.completed ? '已完成' : '未完成'} · {transientResult.totalSteps} 个输出步
        </span>

        {/* Concentration unit selector */}
        <select
          value={concUnit}
          onChange={(e) => setConcUnit(e.target.value as ConcUnit)}
          className="ml-2 px-1.5 py-0.5 text-[11px] border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {CONC_UNITS.map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>

        <div className="flex-1" />
        <button onClick={handleExportCSV} className="p-0.5 hover:bg-accent rounded" title="导出CSV">
          <Download size={12} className="text-muted-foreground" />
        </button>
        <button onClick={() => setTransientResult(null)} className="p-0.5 hover:bg-accent rounded">
          <X size={12} className="text-muted-foreground" />
        </button>
      </div>

      <div className="flex gap-2 p-2 overflow-x-auto" style={{ maxHeight: 280 }}>
        {concSeries.length > 0 && (
          <div className="flex-1 min-w-[350px]">
            <ReactEChartsCore option={concOption} style={{ height: 240 }} notMerge />
          </div>
        )}
        {pressureSeries.length > 0 && (
          <div className="flex-1 min-w-[350px]">
            <ReactEChartsCore option={pressureOption} style={{ height: 240 }} notMerge />
          </div>
        )}
      </div>
    </div>
  );
}
