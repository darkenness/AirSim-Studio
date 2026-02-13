import { useAppStore } from '../../store/useAppStore';
import { useEffect } from 'react';

const TOOL_NAMES: Record<string, string> = {
  select: '选择',
  addRoom: '添加房间',
  addAmbient: '添加室外节点',
  addLink: '创建连接',
};

const SHORTCUTS: Record<string, string> = {
  '1': '选择',
  '2': '房间',
  '3': '室外',
  '4': '连接',
  'Del': '删除',
  'Esc': '取消选择',
};

export default function StatusBar() {
  const {
    nodes, links, toolMode, setToolMode,
    selectedNodeId, selectedLinkId, selectNode, selectLink,
    removeNode, removeLink,
  } = useAppStore();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '1': setToolMode('select'); break;
        case '2': setToolMode('addRoom'); break;
        case '3': setToolMode('addAmbient'); break;
        case '4': setToolMode('addLink'); break;
        case 'Escape':
          selectNode(null);
          selectLink(null);
          setToolMode('select');
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedNodeId !== null) {
            removeNode(selectedNodeId);
          } else if (selectedLinkId !== null) {
            removeLink(selectedLinkId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, selectedLinkId, setToolMode, selectNode, selectLink, removeNode, removeLink]);

  const { species } = useAppStore();
  const roomCount = nodes.filter((n) => n.type === 'normal').length;
  const ambientCount = nodes.filter((n) => n.type === 'ambient').length;

  const elemLabels: Record<string, string> = {
    PowerLawOrifice: '孔口', TwoWayFlow: '大开口', Fan: '风扇', Duct: '风管', Damper: '阀门',
  };
  const elemCounts: Record<string, number> = {};
  links.forEach((l) => { elemCounts[l.element.type] = (elemCounts[l.element.type] || 0) + 1; });
  const elemSummary = Object.entries(elemCounts).map(([t, c]) => `${elemLabels[t] ?? t}×${c}`).join(' ');

  return (
    <footer className="h-7 bg-slate-50 border-t border-slate-200 flex items-center px-3 gap-4 text-[10px] text-slate-500 shrink-0 select-none">
      <span>
        当前工具: <strong className="text-slate-700">{TOOL_NAMES[toolMode]}</strong>
      </span>
      <div className="w-px h-3.5 bg-slate-200" />
      <span>房间: <strong className="text-slate-700">{roomCount}</strong></span>
      <span>室外: <strong className="text-slate-700">{ambientCount}</strong></span>
      <span>路径: <strong className="text-slate-700">{links.length}</strong>{elemSummary && <span className="text-slate-400 ml-0.5">({elemSummary})</span>}</span>
      {species.length > 0 && <span>污染物: <strong className="text-purple-600">{species.length}</strong></span>}

      {(selectedNodeId !== null || selectedLinkId !== null) && (
        <>
          <div className="w-px h-3.5 bg-slate-200" />
          <span className="text-blue-600">
            已选中: {selectedNodeId !== null
              ? nodes.find((n) => n.id === selectedNodeId)?.name ?? `节点 #${selectedNodeId}`
              : `路径 #${selectedLinkId}`}
          </span>
        </>
      )}

      <div className="flex-1" />

      <span className="text-slate-400">
        快捷键: {Object.entries(SHORTCUTS).map(([k, v]) => `${k}=${v}`).join('  ')}
      </span>
    </footer>
  );
}
