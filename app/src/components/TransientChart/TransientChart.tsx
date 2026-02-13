import ReactEChartsCore from 'echarts-for-react';
import { useAppStore } from '../../store/useAppStore';
import { X, TrendingUp } from 'lucide-react';

export default function TransientChart() {
  const { transientResult, setTransientResult } = useAppStore();

  if (!transientResult) return null;

  const { timeSeries, nodes, species } = transientResult;
  if (!timeSeries || timeSeries.length === 0) return null;

  // Build time axis (convert seconds to minutes for readability)
  const timeData = timeSeries.map((ts) => (ts.time / 60).toFixed(1));

  // Build concentration series for each non-ambient node × each species
  const concSeries: { name: string; data: number[]; type: 'line' }[] = [];
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#6366f1', '#0891b2', '#be185d'];
  let colorIdx = 0;

  nodes.forEach((node, nodeIdx) => {
    if (node.type === 'ambient') return;
    species.forEach((sp, spIdx) => {
      const data = timeSeries.map((ts) => {
        if (!ts.concentrations || !ts.concentrations[nodeIdx]) return 0;
        return ts.concentrations[nodeIdx][spIdx] ?? 0;
      });
      concSeries.push({
        name: `${node.name} - ${sp.name}`,
        data,
        type: 'line',
      });
      colorIdx++;
    });
  });

  // Build pressure series for non-ambient nodes
  const pressureSeries: { name: string; data: number[]; type: 'line' }[] = [];
  nodes.forEach((node, nodeIdx) => {
    if (node.type === 'ambient') return;
    const data = timeSeries.map((ts) => ts.airflow?.pressures?.[nodeIdx] ?? 0);
    pressureSeries.push({
      name: `${node.name} 压力`,
      data,
      type: 'line',
    });
  });

  const concOption = {
    title: { text: '污染物浓度', textStyle: { fontSize: 12, color: '#334155' }, left: 10, top: 5 },
    tooltip: { trigger: 'axis' as const, textStyle: { fontSize: 11 } },
    legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    grid: { top: 35, right: 20, bottom: 30, left: 55 },
    xAxis: { type: 'category' as const, data: timeData, name: '时间 (min)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value' as const, name: '浓度 (kg/m³)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9, formatter: (v: number) => v.toExponential(1) } },
    color: colors,
    series: concSeries,
    animation: false,
  };

  const pressureOption = {
    title: { text: '节点压力', textStyle: { fontSize: 12, color: '#334155' }, left: 10, top: 5 },
    tooltip: { trigger: 'axis' as const, textStyle: { fontSize: 11 } },
    legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    grid: { top: 35, right: 20, bottom: 30, left: 55 },
    xAxis: { type: 'category' as const, data: timeData, name: '时间 (min)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'value' as const, name: '压力 (Pa)', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    color: colors.slice(3),
    series: pressureSeries,
    animation: false,
  };

  return (
    <div className="bg-white border-t border-slate-200 shrink-0">
      <div className="flex items-center px-4 py-1.5 gap-2 border-b border-slate-100">
        <TrendingUp size={14} className="text-teal-500" />
        <span className="text-xs font-bold text-slate-700">瞬态仿真结果</span>
        <span className="text-[10px] text-slate-400">
          {transientResult.completed ? '已完成' : '未完成'} · {transientResult.totalSteps} 个输出步
        </span>
        <div className="flex-1" />
        <button onClick={() => setTransientResult(null)} className="p-0.5 hover:bg-slate-100 rounded">
          <X size={12} className="text-slate-400" />
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
