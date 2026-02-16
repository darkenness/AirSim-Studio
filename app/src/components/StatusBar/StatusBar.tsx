import { useCanvasStore } from '../../store/useCanvasStore';
import { useEffect, useState } from 'react';
import ShortcutDialog from '../ShortcutDialog/ShortcutDialog';

const TOOL_NAMES: Record<string, string> = {
  select: '选择',
  wall: '画墙',
  rect: '矩形房间',
  door: '放置门',
  window: '放置窗',
  erase: '删除',
  pan: '平移',
};

export default function StatusBar() {
  const toolMode = useCanvasStore(s => s.toolMode);
  const cursorGrid = useCanvasStore(s => s.cursorGrid);
  const hoveredEdgeId = useCanvasStore(s => s.hoveredEdgeId);
  const hoveredFaceId = useCanvasStore(s => s.hoveredFaceId);
  const selectedEdgeId = useCanvasStore(s => s.selectedEdgeId);
  const selectedFaceId = useCanvasStore(s => s.selectedFaceId);
  const stories = useCanvasStore(s => s.stories);
  const activeStoryId = useCanvasStore(s => s.activeStoryId);
  const [shortcutOpen, setShortcutOpen] = useState(false);

  const activeStory = stories.find(s => s.id === activeStoryId);
  const wallCount = activeStory?.geometry.edges.length ?? 0;
  const zoneCount = activeStory?.geometry.faces.length ?? 0;

  // Global Undo/Redo + ? shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useCanvasStore.temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useCanvasStore.temporal.getState().redo();
        return;
      }
      if (e.key === '?') setShortcutOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Left column: hover/selection info
  let leftInfo = `工具: ${TOOL_NAMES[toolMode] ?? toolMode}`;
  if (hoveredEdgeId) leftInfo = `墙壁 ${hoveredEdgeId.slice(0, 8)}`;
  if (hoveredFaceId) {
    const zone = activeStory?.zoneAssignments.find(z => z.faceId === hoveredFaceId);
    leftInfo = zone ? `区域: ${zone.name} (${zone.volume.toFixed(0)}m³)` : `面 ${hoveredFaceId.slice(0, 8)}`;
  }
  if (selectedEdgeId) leftInfo = `已选墙壁 ${selectedEdgeId.slice(0, 8)}`;
  if (selectedFaceId) {
    const zone = activeStory?.zoneAssignments.find(z => z.faceId === selectedFaceId);
    leftInfo = zone ? `已选: ${zone.name}` : `已选面 ${selectedFaceId.slice(0, 8)}`;
  }

  // Center: grid coordinates
  const centerInfo = cursorGrid
    ? `X: ${cursorGrid.x.toFixed(1)}m  Y: ${cursorGrid.y.toFixed(1)}m`
    : '';

  // Right: story info + counts
  const storyLevel = activeStory ? activeStory.level + 1 : 1;
  const rightInfo = `墙: ${wallCount}  区域: ${zoneCount}  |  ${activeStory?.name ?? '首层'} (${storyLevel}/${stories.length})`;

  return (
    <footer className="h-8 bg-card border-t border-border grid grid-cols-3 items-center px-4 text-[11px] text-muted-foreground shrink-0 select-none">
      <span className="truncate">{leftInfo}</span>
      <span className="text-center font-data text-[10px] tracking-tight">{centerInfo}</span>
      <span className="text-right truncate font-data text-[10px]">{rightInfo}</span>
      <ShortcutDialog open={shortcutOpen} onClose={() => setShortcutOpen(false)} />
    </footer>
  );
}
