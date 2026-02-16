import { useCanvasStore, type ToolMode, type PlacementToolType } from '../../store/useCanvasStore';
import { MousePointer2, PenLine, Square, DoorOpen, Eraser, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useEffect, useState } from 'react';

// H-10: All placeable element types with labels
const PLACEMENT_TYPES: { type: PlacementToolType; label: string }[] = [
  { type: 'door', label: '门' },
  { type: 'window', label: '窗' },
  { type: 'opening', label: '开口' },
  { type: 'fan', label: '风机' },
  { type: 'duct', label: '风管' },
  { type: 'damper', label: '风阀' },
  { type: 'filter', label: '过滤器' },
  { type: 'crack', label: '裂缝' },
  { type: 'srv', label: '自调节风口' },
  { type: 'checkValve', label: '止回阀' },
];

const tools: { mode: ToolMode; icon: React.ReactNode; label: string; tip: string; shortcut: string }[] = [
  { mode: 'select', icon: <MousePointer2 size={20} strokeWidth={2.2} />, label: '选择', tip: '选择/移动墙壁和区域', shortcut: '1' },
  { mode: 'wall', icon: <PenLine size={20} strokeWidth={2.2} />, label: '画墙', tip: '点击两端画正交墙，围合自动生成房间', shortcut: '2' },
  { mode: 'rect', icon: <Square size={20} strokeWidth={2.2} />, label: '矩形', tip: '点击两点绘制矩形房间（4面墙）', shortcut: '3' },
  { mode: 'erase', icon: <Eraser size={20} strokeWidth={2.2} />, label: '删除', tip: '点击删除墙壁或组件', shortcut: '6' },
];

export default function VerticalToolbar() {
  const toolMode = useCanvasStore(s => s.toolMode);
  const setToolMode = useCanvasStore(s => s.setToolMode);
  const activePlacementType = useCanvasStore(s => s.activePlacementType);
  const setActivePlacementType = useCanvasStore(s => s.setActivePlacementType);
  const [showPlacementMenu, setShowPlacementMenu] = useState(false);

  const isPlaceMode = toolMode === 'door' || toolMode === 'window';
  const activeLabel = PLACEMENT_TYPES.find(p => p.type === activePlacementType)?.label ?? '门';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === '1' || e.code === 'KeyV') setToolMode('select');
      if (e.key === '2' || e.code === 'KeyW') setToolMode('wall');
      if (e.key === '3' || e.code === 'KeyR') setToolMode('rect');
      if (e.key === '4' || e.code === 'KeyD') setToolMode('door');
      if (e.key === '5' || e.code === 'KeyG') setToolMode('window');
      if (e.key === '6' || e.code === 'KeyE') setToolMode('erase');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setToolMode]);

  // Close menu on click outside
  useEffect(() => {
    if (!showPlacementMenu) return;
    const close = () => setShowPlacementMenu(false);
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [showPlacementMenu]);

  return (
    <aside className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 p-1.5 rounded-2xl"
      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(16px)', boxShadow: 'var(--shadow-soft)' }}
    >
      {tools.slice(0, 3).map((t) => {
        const isActive = toolMode === t.mode;
        return (
          <Tooltip key={t.mode} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setToolMode(t.mode)}
                aria-label={t.tip}
                aria-pressed={isActive}
                className={cn(
                  "relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150",
                  "hover:scale-110 active:scale-95 active:translate-y-0.5",
                  isActive
                    ? "text-primary-foreground bg-primary shadow-md border-b-[3px] border-primary/70"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {t.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="text-xs flex items-center gap-2 rounded-xl">
              <span>{t.tip}</span>
              <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded-lg font-data">{t.shortcut}</kbd>
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* H-10: Placement tool with dropdown for all element types */}
      <div className="relative">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setToolMode('door')}
              onContextMenu={(e) => { e.preventDefault(); setShowPlacementMenu(v => !v); }}
              aria-label={`放置${activeLabel}`}
              aria-pressed={isPlaceMode}
              className={cn(
                "relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150",
                "hover:scale-110 active:scale-95 active:translate-y-0.5",
                isPlaceMode
                  ? "text-primary-foreground bg-primary shadow-md border-b-[3px] border-primary/70"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <DoorOpen size={20} strokeWidth={2.2} />
              <ChevronRight size={8} className="absolute right-0.5 bottom-0.5 opacity-50" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="text-xs flex items-center gap-2 rounded-xl">
            <span>放置{activeLabel}（右键选择类型）</span>
            <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded-lg font-data">4</kbd>
          </TooltipContent>
        </Tooltip>

        {showPlacementMenu && (
          <div
            className="absolute left-full top-0 ml-2 py-1 rounded-xl border border-border min-w-[120px] z-50"
            style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', boxShadow: 'var(--shadow-soft)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {PLACEMENT_TYPES.map((pt) => (
              <button
                key={pt.type}
                onClick={() => {
                  setActivePlacementType(pt.type);
                  setToolMode('door');
                  setShowPlacementMenu(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors",
                  activePlacementType === pt.type ? "text-primary font-semibold" : "text-foreground"
                )}
              >
                {pt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Erase tool */}
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            onClick={() => setToolMode('erase')}
            aria-label="点击删除墙壁或组件"
            aria-pressed={toolMode === 'erase'}
            className={cn(
              "relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150",
              "hover:scale-110 active:scale-95 active:translate-y-0.5",
              toolMode === 'erase'
                ? "text-primary-foreground bg-primary shadow-md border-b-[3px] border-primary/70"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Eraser size={20} strokeWidth={2.2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="text-xs flex items-center gap-2 rounded-xl">
          <span>点击删除墙壁或组件</span>
          <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded-lg font-data">6</kbd>
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}
