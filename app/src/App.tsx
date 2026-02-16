import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/toaster';
import TopBar from './components/TopBar/TopBar';
import VerticalToolbar from './components/VerticalToolbar/VerticalToolbar';
import Canvas2D from './canvas/Canvas2D';
import ControlFlowCanvas from './control/ControlFlowCanvas';
import WelcomePage from './components/WelcomePage/WelcomePage';
import PropertyPanel from './components/PropertyPanel/PropertyPanel';
import ResultsView from './components/ResultsView/ResultsView';
import TransientChart from './components/TransientChart/TransientChart';
import ExposureReport from './components/ExposureReport/ExposureReport';
import StatusBar from './components/StatusBar/StatusBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { useCanvasStore } from './store/useCanvasStore';
import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, PanelRightOpen, PanelRightClose, Layers, GitBranch, Loader2 } from 'lucide-react';
import { toast } from './hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';

function BottomPanel() {
  const { result, transientResult } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const hasResults = result || transientResult;

  if (!hasResults) return null;

  return (
    <>
      <div className="h-px bg-border shrink-0" />
      {!collapsed ? (
        <div className="max-h-[320px] overflow-auto shrink-0 bg-card">
          <Tabs defaultValue={transientResult ? 'transient' : 'steady'}>
            <div className="flex items-center px-3 border-b border-border">
              <TabsList className="h-8">
                {result && <TabsTrigger value="steady" className="text-xs">稳态结果</TabsTrigger>}
                {transientResult && <TabsTrigger value="transient" className="text-xs">瞬态图表</TabsTrigger>}
                {transientResult && <TabsTrigger value="exposure" className="text-xs">暴露报告</TabsTrigger>}
              </TabsList>
              <div className="flex-1" />
              <button
                onClick={() => setCollapsed(true)}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {result && (
              <TabsContent value="steady" className="mt-0">
                <ResultsView />
              </TabsContent>
            )}
            {transientResult && (
              <TabsContent value="transient" className="mt-0">
                <TransientChart />
              </TabsContent>
            )}
            {transientResult && (
              <TabsContent value="exposure" className="mt-0">
                <ExposureReport />
              </TabsContent>
            )}
          </Tabs>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-1 bg-card border-t border-border shrink-0">
          <span className="text-xs font-medium text-muted-foreground">
            {transientResult ? '瞬态仿真结果' : '稳态求解结果'} (已折叠)
          </span>
          <button
            onClick={() => setCollapsed(false)}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      )}
    </>
  );
}

function SimulationOverlay() {
  const isRunning = useAppStore(s => s.isRunning);
  if (!isRunning) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-lg">
        <Loader2 className="animate-spin text-primary" size={32} />
        <span className="text-sm font-medium text-foreground">正在运行仿真...</span>
      </div>
    </div>
  );
}

function App() {
  const { loadFromJson } = useAppStore();
  const sidebarOpen = useCanvasStore(s => s.sidebarOpen);
  const setSidebarOpen = useCanvasStore(s => s.setSidebarOpen);
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeView, setActiveView] = useState<'canvas' | 'control'>('canvas');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.json')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        loadFromJson(json);
        setShowWelcome(false);
        toast({ title: '已加载', description: file.name });
      } catch {
        toast({ title: '文件解析失败', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
  }, [loadFromJson]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground" onDragOver={handleDragOver} onDrop={handleDrop}>
        {showWelcome ? (
          <>
            <TopBar />
            <WelcomePage onStart={() => setShowWelcome(false)} />
          </>
        ) : (
          <>
            {/* ── Row 1: TopBar (fixed height, in document flow) ── */}
            <TopBar />

            {/* ── Row 2: Main workspace (flex-1, contains canvas + floating UI) ── */}
            <div className="flex-1 min-h-0 relative overflow-hidden">
              {/* Full-screen canvas (z-0) */}
              <ErrorBoundary fallbackTitle="画布渲染出错">
                {activeView === 'canvas' ? (
                  <Canvas2D />
                ) : (
                  <ControlFlowCanvas />
                )}
              </ErrorBoundary>

              {/* Floating VerticalToolbar (z-20, self-positioned) */}
              <VerticalToolbar />

              {/* Floating view tab switcher (z-20) */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                <div className="flex gap-1 p-1.5 rounded-2xl"
                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(16px)', boxShadow: 'var(--shadow-soft)' }}
                >
                  <button
                    onClick={() => setActiveView('canvas')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      activeView === 'canvas'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-[3px] border-primary/70'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Layers size={15} />
                    2D 画布
                  </button>
                  <button
                    onClick={() => setActiveView('control')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      activeView === 'control'
                        ? 'bg-primary text-primary-foreground shadow-md border-b-[3px] border-primary/70'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <GitBranch size={15} />
                    控制网络
                  </button>
                </div>
              </div>

              {/* Sidebar toggle button — floats independently, shifts with sidebar */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`absolute top-3 z-20 w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-200 hover:scale-110 active:scale-95 active:translate-y-0.5 text-muted-foreground hover:text-foreground ${
                  sidebarOpen ? 'right-[348px]' : 'right-3'
                }`}
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  backdropFilter: 'blur(16px)',
                  boxShadow: 'var(--shadow-soft)',
                }}
                title={sidebarOpen ? '关闭侧边栏' : '打开侧边栏'}
              >
                {sidebarOpen ? <PanelRightClose size={18} strokeWidth={2.2} /> : <PanelRightOpen size={18} strokeWidth={2.2} />}
              </button>

              {/* Sliding Sidebar (z-30) */}
              <div
                className={`absolute top-0 right-0 bottom-0 w-[340px] z-30 bg-card/95 backdrop-blur-xl border-l border-border shadow-xl transition-transform duration-200 ease-out overflow-hidden flex flex-col ${
                  sidebarOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
              >
                <ErrorBoundary fallbackTitle="属性面板出错">
                  <PropertyPanel />
                </ErrorBoundary>
              </div>

              {/* Floating BottomBar (z-20) */}
              <div className="absolute bottom-3 left-3 right-3 z-20 max-w-[900px] mx-auto">
                <div className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(16px)', boxShadow: 'var(--shadow-soft)' }}
                >
                  <ErrorBoundary fallbackTitle="结果面板出错">
                    <BottomPanel />
                  </ErrorBoundary>
                </div>
              </div>

              {/* Simulation loading overlay (z-50) */}
              <SimulationOverlay />
            </div>

            {/* ── Row 3: StatusBar (fixed height, in document flow) ── */}
            <StatusBar />
          </>
        )}
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App
