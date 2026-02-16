import { useAppStore } from '../../store/useAppStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Play, Save, FolderOpen, Undo2, Redo2, Trash2, Moon, Sun, FileDown } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { toast } from '../../hooks/use-toast';
import { canvasToTopology, validateModel, validateTopology, steadyResultToCSV, transientResultToCSV } from '../../model/dataBridge';
import { saveFile, openFile, downloadFile } from '../../utils/fileOps';

export default function TopBar() {
  const { isRunning, clearAll, setResult, setIsRunning, setError, loadFromJson, species, setTransientResult, result, transientResult } = useAppStore();
  const setAppMode = useCanvasStore(s => s.setAppMode);
  const isTransient = species.length > 0;
  const [isDark, setIsDark] = useState(() => {
    // Persist dark mode preference
    const saved = localStorage.getItem('contam-dark-mode');
    if (saved !== null) {
      const dark = saved === 'true';
      if (dark && !document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.add('dark');
      }
      return dark;
    }
    return document.documentElement.classList.contains('dark');
  });
  const hasResults = result !== null || transientResult !== null;

  // L-28: Elapsed time counter during simulation
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  const toggleDark = useCallback(() => {
    document.documentElement.classList.toggle('dark');
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem('contam-dark-mode', String(newDark));
  }, [isDark]);

  const handleExportCSV = useCallback(async () => {
    if (transientResult) {
      const csv = transientResultToCSV();
      if (csv) await downloadFile(csv, 'transient_results.csv');
    } else if (result) {
      const csv = steadyResultToCSV();
      if (csv) await downloadFile(csv, 'steady_results.csv');
    }
  }, [result, transientResult]);

  const handleRun = async () => {
    // Validate model before running
    const { errors, warnings } = validateModel();
    if (errors.length > 0) {
      toast({ title: '模型验证失败', description: errors.join('\n'), variant: 'destructive' });
      return;
    }
    if (warnings.length > 0) {
      toast({ title: '模型警告', description: warnings.join('\n') });
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setTransientResult(null);

    try {
      // Use canvas geometry → topology bridge
      const topology = canvasToTopology();

      // L-36: Runtime structural validation before engine call
      const topoErrors = validateTopology(topology as unknown as Record<string, unknown>);
      if (topoErrors.length > 0) {
        toast({ title: '拓扑结构错误', description: topoErrors.join('\n'), variant: 'destructive' });
        setIsRunning(false);
        return;
      }

      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        // L-27: 60s timeout for engine execution
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('仿真超时（60秒），请检查模型复杂度或引擎状态')), 60000));
        const resultJson = await Promise.race([invoke<string>('run_engine', { input: JSON.stringify(topology) }), timeout]);
        const parsed = JSON.parse(resultJson);
        if (parsed.timeSeries) {
          setTransientResult(parsed);
        } else {
          setResult(parsed);
        }
        toast({ title: '求解完成', description: parsed.timeSeries ? `瞬态仿真完成，${parsed.totalSteps} 步` : '稳态收敛', variant: 'success' });
        setAppMode('results');
      } else {
        // C-05: Browser mode — warn user that results are mock data
        toast({ title: '演示模式', description: '浏览器环境无法运行真实引擎，显示的是模拟数据。请使用桌面版获取真实结果。', variant: 'destructive' });
        await new Promise((r) => setTimeout(r, 500));
        if (isTransient) {
          const numSteps = 10;
          const timeSeries = Array.from({ length: numSteps }, (_, i) => ({
            time: i * 60,
            airflow: { converged: true, iterations: 5, pressures: topology.nodes.map((n) => n.type === 'ambient' ? 0 : -0.3), massFlows: topology.links.map(() => 0.0005) },
            concentrations: topology.nodes.map((n) =>
              topology.species?.map((_, si) => n.type === 'ambient' ? (topology.species?.[si]?.outdoorConcentration ?? 0) : i * 1e-5) ?? []
            ),
          }));
          setTransientResult({
            completed: true, totalSteps: numSteps,
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
              temperature: n.temperature ?? 293.15, elevation: n.elevation ?? 0,
            })),
            links: topology.links.map((l) => ({
              id: l.id, from: l.from, to: l.to,
              massFlow: (Math.random() - 0.5) * 0.001,
              volumeFlow_m3s: (Math.random() - 0.5) * 0.001,
            })),
          });
        }
        toast({ title: '求解完成', variant: 'success' });
        setAppMode('results');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      toast({ title: '求解失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    const topology = canvasToTopology();
    const content = JSON.stringify(topology, null, 2);
    const saved = await saveFile(content, 'model.contam.json', [
      { name: 'CONTAM JSON', extensions: ['contam.json', 'json'] },
    ]);
    if (saved) {
      const name = saved.split(/[\\/]/).pop() ?? saved;
      toast({ title: '已保存', description: name });
    }
  };

  const handleOpen = async () => {
    const result = await openFile([
      { name: 'CONTAM JSON', extensions: ['contam.json', 'json'] },
    ]);
    if (!result) return;
    try {
      const json = JSON.parse(result.content);
      loadFromJson(json);
      toast({ title: '已加载', description: result.name });
    } catch (err) {
      setError(`文件解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <header className="h-14 border-b border-border flex items-center px-4 pr-6 gap-1.5 shrink-0 select-none"
      style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px)' }}
    >
      {/* Logo mark */}
      <div className="flex items-center gap-2.5 mr-2 pl-0.5">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-md border-b-2 border-primary/60">
          <svg width="18" height="18" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L11 4V8L6 11L1 8V4L6 1Z" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-primary-foreground"/>
            <circle cx="6" cy="6" r="1.5" fill="currentColor" className="text-primary-foreground"/>
          </svg>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-bold text-foreground text-sm tracking-tight">AirSim</span>
          <span className="text-muted-foreground text-xs font-medium">Studio · 2D</span>
        </div>
      </div>

      <div className="w-px h-7 bg-border mx-1.5" />

      {/* Run simulation */}
      <Button onClick={handleRun} disabled={isRunning} size="sm"
        className="h-9 gap-1.5 px-4 text-sm font-semibold rounded-xl border-b-[3px] border-primary/50 active:border-b-0 active:translate-y-0.5 transition-all shadow-md"
      >
        <Play size={15} fill="currentColor" />
        {isRunning ? '计算中...' : (isTransient ? '瞬态仿真' : '稳态求解')}
      </Button>

      {isRunning && (
        <div className="flex items-center gap-1.5 ml-1.5">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '100%' }} />
          </div>
          <span className="text-xs font-data text-muted-foreground tabular-nums">{elapsed}s</span>
        </div>
      )}

      <div className="w-px h-7 bg-border mx-1.5" />

      {/* Edit group: Undo/Redo */}
      <div className="flex items-center gap-1">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => { useCanvasStore.temporal.getState().undo(); useAppStore.temporal.getState().undo(); }}>
              <Undo2 size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs rounded-xl">撤销 <kbd className="ml-1 px-1 py-0.5 bg-muted rounded-lg text-xs font-data">Ctrl+Z</kbd></TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => { useCanvasStore.temporal.getState().redo(); useAppStore.temporal.getState().redo(); }}>
              <Redo2 size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs rounded-xl">重做</TooltipContent>
        </Tooltip>
      </div>

      {/* Export */}
      {hasResults && (
        <>
          <div className="w-px h-6 bg-border mx-1.5" />
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleExportCSV}>
                <FileDown size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs rounded-xl">导出 CSV</TooltipContent>
          </Tooltip>
        </>
      )}

      <div className="flex-1" />

      {/* Right group: Theme + File ops */}
      <div className="flex items-center gap-1">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={toggleDark}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs rounded-xl">{isDark ? '浅色模式' : '深色模式'}</TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-border mx-0.5" />

        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleSave}><Save size={18} /></Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs rounded-xl">保存</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleOpen}><FolderOpen size={18} /></Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs rounded-xl">打开</TooltipContent>
        </Tooltip>

        <AlertDialog>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-destructive/10 hover:text-destructive"><Trash2 size={18} /></Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs rounded-xl">清空</TooltipContent>
          </Tooltip>
          <AlertDialogContent className="max-w-sm rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">确认清空所有数据</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">所有墙壁、区域、气流路径、污染物和排程数据将被永久删除，此操作无法撤销。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => { clearAll(); useCanvasStore.getState().clearAll(); }} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">确认清空</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  );
}
