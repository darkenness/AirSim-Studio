import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/toaster';
import TopBar from './components/TopBar/TopBar';
import VerticalToolbar from './components/VerticalToolbar/VerticalToolbar';
import SketchPad from './components/SketchPad/SketchPad';
import WelcomePage from './components/WelcomePage/WelcomePage';
import PropertyPanel from './components/PropertyPanel/PropertyPanel';
import ResultsView from './components/ResultsView/ResultsView';
import TransientChart from './components/TransientChart/TransientChart';
import ExposureReport from './components/ExposureReport/ExposureReport';
import StatusBar from './components/StatusBar/StatusBar';
import { useAppStore } from './store/useAppStore';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

function App() {
  const { nodes } = useAppStore();
  const isEmpty = nodes.length === 0;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-screen bg-background text-foreground">
        <TopBar />
        {isEmpty ? (
          <WelcomePage />
        ) : (
          <div className="flex flex-1 min-h-0">
            <VerticalToolbar />
            <PanelGroup orientation="horizontal">
              {/* Center: Canvas + Bottom Results */}
              <Panel defaultSize={75} minSize={40}>
                <div className="flex flex-col h-full">
                  <div className="flex-1 min-h-0">
                    <SketchPad />
                  </div>
                  <BottomPanel />
                </div>
              </Panel>

              {/* Resize Handle */}
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

              {/* Right: Property Panel */}
              <Panel defaultSize={25} minSize={15} maxSize={40}>
                <PropertyPanel />
              </Panel>
            </PanelGroup>
          </div>
        )}
        <StatusBar />
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App
