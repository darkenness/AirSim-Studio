import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

const SHORTCUTS = [
  { keys: ['1'], desc: '选择工具' },
  { keys: ['2'], desc: '添加房间' },
  { keys: ['3'], desc: '添加室外节点' },
  { keys: ['4'], desc: '创建连接' },
  { keys: ['Delete'], desc: '删除选中元素' },
  { keys: ['Escape'], desc: '取消选择' },
  { keys: ['Ctrl', 'Z'], desc: '撤销' },
  { keys: ['Ctrl', 'Shift', 'Z'], desc: '重做' },
  { keys: ['滚轮'], desc: '画布缩放' },
  { keys: ['拖拽'], desc: '画布平移（选择模式下）' },
  { keys: ['右键'], desc: '上下文菜单' },
  { keys: ['?'], desc: '显示此面板' },
];

export default function ShortcutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>常用操作快捷键一览</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 mt-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0">
              <span className="text-sm text-foreground">{s.desc}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="px-2 py-0.5 text-xs font-mono bg-muted text-muted-foreground rounded border border-border">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
