import { useEffect } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Plus, ChevronUp, ChevronDown, Copy, Trash2, Maximize } from 'lucide-react';
import { cn } from '../../lib/utils';

export function FloorSwitcher() {
  const stories = useCanvasStore(s => s.stories);
  const activeStoryId = useCanvasStore(s => s.activeStoryId);
  const setActiveStory = useCanvasStore(s => s.setActiveStory);
  const addStory = useCanvasStore(s => s.addStory);
  const removeStory = useCanvasStore(s => s.removeStory);
  const duplicateStory = useCanvasStore(s => s.duplicateStory);
  const requestZoomToFit = useCanvasStore(s => s.requestZoomToFit);
  const sidebarOpen = useCanvasStore(s => s.sidebarOpen);

  const activeIdx = stories.findIndex(s => s.id === activeStoryId);

  // PageUp/PageDown shortcuts for floor switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'PageUp') {
        e.preventDefault();
        if (activeIdx < stories.length - 1) {
          setActiveStory(stories[activeIdx + 1].id);
        }
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        if (activeIdx > 0) {
          setActiveStory(stories[activeIdx - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIdx, stories, setActiveStory]);

  const iconBtn = (
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    disabled?: boolean,
    destructive?: boolean,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-150",
        "hover:scale-110 active:scale-95 active:translate-y-0.5",
        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        "disabled:opacity-30 disabled:pointer-events-none",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1 p-1.5 rounded-2xl transition-all duration-200",
        sidebarOpen ? "right-[356px]" : "right-3",
      )}
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      {iconBtn(
        () => { if (activeIdx < stories.length - 1) setActiveStory(stories[activeIdx + 1].id); },
        <ChevronUp size={15} strokeWidth={2.2} />,
        '上一层 (PageUp)',
        activeIdx >= stories.length - 1,
      )}

      {stories.map((story) => (
        <button
          key={story.id}
          onClick={() => setActiveStory(story.id)}
          className={cn(
            "w-8 h-8 text-[11px] font-bold rounded-xl flex items-center justify-center transition-all duration-150",
            "hover:scale-110 active:scale-95",
            story.id === activeStoryId
              ? 'bg-primary text-primary-foreground shadow-md border-b-[3px] border-primary/70'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
          title={story.name}
        >
          {story.level + 1}F
        </button>
      ))}

      {iconBtn(
        () => { if (activeIdx > 0) setActiveStory(stories[activeIdx - 1].id); },
        <ChevronDown size={15} strokeWidth={2.2} />,
        '下一层 (PageDown)',
        activeIdx <= 0,
      )}

      <div className="w-6 h-px bg-border/60 my-0.5" />

      {iconBtn(() => addStory(), <Plus size={15} strokeWidth={2.2} />, '添加楼层')}
      {iconBtn(() => duplicateStory(activeStoryId), <Copy size={14} strokeWidth={2.2} />, '复制当前楼层')}
      {stories.length > 1 && iconBtn(
        () => removeStory(activeStoryId),
        <Trash2 size={14} strokeWidth={2.2} />,
        '删除当前楼层',
        false,
        true,
      )}

      <div className="w-6 h-px bg-border/60 my-0.5" />

      {iconBtn(() => requestZoomToFit(), <Maximize size={14} strokeWidth={2.2} />, '缩放至适合')}
    </div>
  );
}
