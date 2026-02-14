import { useCanvasStore, type ToolMode } from '../../store/useCanvasStore';
import { MousePointer2, PenLine, Square, DoorOpen, SquareAsterisk, Eraser } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useEffect } from 'react';

const tools: { mode: ToolMode; icon: React.ReactNode; label: string; tip: string; shortcut: string }[] = [
  { mode: 'select', icon: <MousePointer2 size={18} strokeWidth={2.2} />, label: '选择', tip: '选择/移动墙壁和区域', shortcut: '1' },
  { mode: 'wall', icon: <PenLine size={18} strokeWidth={2.2} />, label: '画墙', tip: '点击两端画正交墙，围合自动生成房间', shortcut: '2' },
  { mode: 'rect', icon: <Square size={18} strokeWidth={2.2} />, label: '矩形', tip: '拖拽绘制矩形房间（4面墙）', shortcut: '3' },
  { mode: 'door', icon: <DoorOpen size={18} strokeWidth={2.2} />, label: '门', tip: '在墙上放置门/气流路径', shortcut: '4' },
  { mode: 'window', icon: <SquareAsterisk size={18} strokeWidth={2.2} />, label: '窗', tip: '在墙上放置窗户', shortcut: '5' },
  { mode: 'erase', icon: <Eraser size={18} strokeWidth={2.2} />, label: '删除', tip: '点击删除墙壁或组件', shortcut: '6' },
];

export default function VerticalToolbar() {
  const toolMode = useCanvasStore(s => s.toolMode);
  const setToolMode = useCanvasStore(s => s.setToolMode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < tools.length) {
        setToolMode(tools[idx].mode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setToolMode]);

  return (
    <aside className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 p-1.5 rounded-2xl"
      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(16px)', boxShadow: 'var(--shadow-soft)' }}
    >
      {tools.map((t) => {
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
              <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded-lg font-data">{t.shortcut}</kbd>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </aside>
  );
}
