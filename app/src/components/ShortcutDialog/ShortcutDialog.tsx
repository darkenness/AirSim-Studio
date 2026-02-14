import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

const SHORTCUTS = [
  { keys: ['1', 'V'], desc: '选择工具' },
  { keys: ['2', 'W'], desc: '画墙工具（正交）' },
  { keys: ['3', 'R'], desc: '矩形房间工具' },
  { keys: ['4', 'D'], desc: '放置门' },
  { keys: ['5'], desc: '放置窗' },
  { keys: ['6', 'E'], desc: '删除工具' },
  { keys: ['Space'], desc: '临时平移（按住）' },
  { keys: ['Delete'], desc: '删除选中元素' },
  { keys: ['Escape'], desc: '取消操作 / 关闭侧栏' },
  { keys: ['Ctrl', 'Z'], desc: '撤销' },
  { keys: ['Ctrl', 'Shift', 'Z'], desc: '重做' },
  { keys: ['滚轮'], desc: '画布缩放（鼠标中心）' },
  { keys: ['左键拖拽'], desc: '画布平移（空白区域）' },
  { keys: ['右键'], desc: '上下文菜单' },
  { keys: ['PageUp/Down'], desc: '切换楼层' },
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
