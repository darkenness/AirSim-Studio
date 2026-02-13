import { useAppStore } from '../../store/useAppStore';
import { BarChart3, Box, Link2, FlaskConical, Flame, AlertTriangle } from 'lucide-react';

export default function ModelSummary() {
  const { nodes, links, species, sources } = useAppStore();

  if (nodes.length === 0) return null;

  const rooms = nodes.filter((n) => n.type === 'normal');
  const ambients = nodes.filter((n) => n.type === 'ambient');

  // Element type counts
  const elemCounts: Record<string, number> = {};
  links.forEach((l) => {
    const t = l.element.type;
    elemCounts[t] = (elemCounts[t] || 0) + 1;
  });

  const elemLabels: Record<string, string> = {
    PowerLawOrifice: '孔口',
    TwoWayFlow: '大开口',
    Fan: '风扇',
    Duct: '风管',
    Damper: '阀门',
  };

  // Validation warnings
  const warnings: string[] = [];
  const connectedIds = new Set<number>();
  links.forEach((l) => { connectedIds.add(l.from); connectedIds.add(l.to); });
  const isolated = nodes.filter((n) => !connectedIds.has(n.id));
  if (isolated.length > 0) {
    warnings.push(`孤立节点: ${isolated.map((n) => n.name).join(', ')}`);
  }
  if (ambients.length === 0) {
    warnings.push('缺少室外节点');
  }
  if (rooms.length > 0 && links.length === 0) {
    warnings.push('尚未创建气流路径');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <BarChart3 size={14} className="text-blue-500" />
        <span className="text-xs font-bold text-slate-700">模型摘要</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="flex items-center gap-1">
          <Box size={10} className="text-blue-400" />
          <span className="text-slate-500">房间</span>
          <span className="ml-auto font-bold text-slate-700">{rooms.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Box size={10} className="text-green-400" />
          <span className="text-slate-500">室外</span>
          <span className="ml-auto font-bold text-slate-700">{ambients.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Link2 size={10} className="text-slate-400" />
          <span className="text-slate-500">路径</span>
          <span className="ml-auto font-bold text-slate-700">{links.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <FlaskConical size={10} className="text-purple-400" />
          <span className="text-slate-500">污染物</span>
          <span className="ml-auto font-bold text-slate-700">{species.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Flame size={10} className="text-orange-400" />
          <span className="text-slate-500">源/汇</span>
          <span className="ml-auto font-bold text-slate-700">{sources.length}</span>
        </div>
      </div>

      {Object.keys(elemCounts).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {Object.entries(elemCounts).map(([type, count]) => (
            <span key={type} className="px-1.5 py-0.5 text-[9px] bg-slate-100 text-slate-600 rounded-full">
              {elemLabels[type] ?? type} ×{count}
            </span>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1 text-[10px] text-amber-600">
              <AlertTriangle size={10} className="shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
