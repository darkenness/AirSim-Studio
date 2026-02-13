import { useAppStore } from '../../store/useAppStore';
import type { ToolMode } from '../../types';
import { MousePointer2, Square, Cloud, Link2, Play, Trash2, Save, FolderOpen } from 'lucide-react';
import { useRef } from 'react';

const tools: { mode: ToolMode; icon: React.ReactNode; label: string; tip: string }[] = [
  { mode: 'select', icon: <MousePointer2 size={18} />, label: '选择', tip: '选择并移动元素' },
  { mode: 'addRoom', icon: <Square size={18} />, label: '房间', tip: '点击画布添加房间' },
  { mode: 'addAmbient', icon: <Cloud size={18} />, label: '室外', tip: '添加室外环境节点' },
  { mode: 'addLink', icon: <Link2 size={18} />, label: '连接', tip: '点击两个节点创建气流路径' },
];

export default function Toolbar() {
  const { toolMode, setToolMode, isRunning, clearAll, exportTopology, setResult, setIsRunning, setError, loadFromJson, species, setTransientResult } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTransient = species.length > 0;

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setTransientResult(null);

    try {
      const topology = exportTopology();

      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const resultJson = await invoke<string>('run_engine', { input: JSON.stringify(topology) });
        const parsed = JSON.parse(resultJson);
        if (parsed.timeSeries) {
          setTransientResult(parsed);
        } else {
          setResult(parsed);
        }
      } else {
        // Browser dev mode: mock
        await new Promise((r) => setTimeout(r, 500));
        if (isTransient) {
          // Mock transient result
          const numSteps = 10;
          const timeSeries = Array.from({ length: numSteps }, (_, i) => ({
            time: i * 60,
            airflow: { converged: true, iterations: 5, pressures: topology.nodes.map((n) => n.type === 'ambient' ? 0 : -0.3), massFlows: topology.links.map(() => 0.0005) },
            concentrations: topology.nodes.map((n) =>
              topology.species?.map((_, si) => n.type === 'ambient' ? (topology.species?.[si]?.outdoorConcentration ?? 0) : i * 1e-5) ?? []
            ),
          }));
          setTransientResult({
            completed: true,
            totalSteps: numSteps,
            species: topology.species?.map((s) => ({ id: s.id, name: s.name, molarMass: s.molarMass })) ?? [],
            nodes: topology.nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
            timeSeries,
          });
        } else {
          setResult({
            solver: { converged: true, iterations: 0, maxResidual: 0 },
            nodes: topology.nodes.map((n) => ({
              id: n.id, name: n.name,
              pressure: n.type === 'ambient' ? 0 : -0.5 + Math.random(),
              density: n.temperature ? 101325 / (287.055 * n.temperature) : 1.2,
              temperature: n.temperature ?? 293.15,
              elevation: n.elevation ?? 0,
            })),
            links: topology.links.map((l) => ({
              id: l.id, from: l.from, to: l.to,
              massFlow: (Math.random() - 0.5) * 0.001,
              volumeFlow_m3s: (Math.random() - 0.5) * 0.001,
            })),
          });
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        loadFromJson(json);
      } catch (err) {
        setError(`文件解析失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = () => {
    const topology = exportTopology();
    const blob = new Blob([JSON.stringify(topology, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.contam.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="h-12 bg-white border-b border-slate-200 flex items-center px-3 gap-1 shrink-0 select-none">
      {/* Logo */}
      <span className="font-bold text-blue-600 text-sm mr-3 tracking-tight">CONTAM-Next</span>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-200 mx-1" />

      {/* Tool buttons */}
      {tools.map((t) => (
        <button
          key={t.mode}
          onClick={() => setToolMode(t.mode)}
          title={t.tip}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all
            ${toolMode === t.mode
              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-6 bg-slate-200 mx-1" />

      {/* Actions */}
      <button
        onClick={handleRun}
        disabled={isRunning}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <Play size={14} fill="currentColor" />
        {isRunning ? '计算中...' : (isTransient ? '瞬态仿真' : '稳态求解')}
      </button>

      <div className="flex-1" />

      {/* File operations */}
      <button onClick={handleSave} title="保存模型" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-700">
        <Save size={16} />
      </button>
      <input ref={fileInputRef} type="file" accept=".json,.contam.json" onChange={handleFileChange} className="hidden" />
      <button onClick={handleOpen} title="打开模型" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-700">
        <FolderOpen size={16} />
      </button>
      <button onClick={clearAll} title="清空全部" className="p-1.5 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600">
        <Trash2 size={16} />
      </button>
    </header>
  );
}
