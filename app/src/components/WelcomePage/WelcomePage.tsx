import { useAppStore } from '../../store/useAppStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { PenLine, FolderOpen, BookOpen, DoorOpen } from 'lucide-react';
import { openFile } from '../../utils/fileOps';

interface WelcomePageProps {
  onStart?: () => void;
}

export default function WelcomePage({ onStart }: WelcomePageProps) {
  const { loadFromJson, setError } = useAppStore();
  const setToolMode = useCanvasStore(s => s.setToolMode);

  const handleOpen = async () => {
    const result = await openFile([
      { name: 'CONTAM JSON', extensions: ['contam.json', 'json'] },
    ]);
    if (!result) return;
    try {
      const json = JSON.parse(result.content);
      loadFromJson(json);
      onStart?.();
    } catch (err) {
      setError(`文件解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleNewProject = () => {
    setToolMode('wall');
    onStart?.();
  };

  const handleStartEmpty = () => {
    onStart?.();
  };

  const steps = [
    '在 2D 画布上画墙，围合区域自动生成房间',
    '在墙上放置门窗、风机等气流路径组件',
    '配置污染物种类、排程和控制系统',
    '运行稳态求解或瞬态仿真，查看结果可视化',
  ];

  const actions = [
    { icon: <PenLine size={22} strokeWidth={2} />, label: '新建项目', desc: '画墙 → 围合 → 仿真', onClick: handleNewProject, accent: true },
    { icon: <DoorOpen size={22} strokeWidth={2} />, label: '空白画布', desc: '自由探索', onClick: handleStartEmpty, accent: false },
    { icon: <BookOpen size={22} strokeWidth={2} />, label: '示例模型', desc: '即将推出', onClick: handleStartEmpty, accent: false },
    { icon: <FolderOpen size={22} strokeWidth={2} />, label: '打开文件', desc: '.contam.json', onClick: handleOpen, accent: false },
  ];

  return (
    <div className="flex-1 flex items-center justify-center bg-background relative overflow-hidden">
      {/* Dot grid background */}
      <div className="absolute inset-0 opacity-[0.35]" style={{
        backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <div className="relative flex flex-col items-center gap-8 max-w-[460px] px-8 animate-[fade-in_0.4s_ease-out]">
        {/* Logo + Title */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg border-b-[3px] border-primary/50 animate-[fade-in_0.3s_ease-out_0.1s_both]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L22 8V16L12 22L2 16V8L12 2Z" stroke="currentColor" strokeWidth="1.8" fill="none" className="text-primary-foreground"/>
              <circle cx="12" cy="12" r="3" fill="currentColor" className="text-primary-foreground"/>
              <path d="M12 9V5M12 15V19M9 12H5M15 12H19" stroke="currentColor" strokeWidth="1" className="text-primary-foreground" opacity="0.5"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">CONTAM-Next</h1>
            <p className="text-sm text-muted-foreground mt-1">多区域气流与污染物传输仿真</p>
            <span className="inline-block mt-2 px-2.5 py-1 text-[10px] font-data text-primary bg-primary/10 rounded-full border border-primary/20">v2.0 · 2D</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="w-full grid grid-cols-2 gap-3">
          {actions.map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`group flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 bg-card transition-all duration-200 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97] active:translate-y-0.5 animate-[fade-in_0.3s_ease-out_both] ${
                a.accent
                  ? 'border-primary/40 shadow-lg'
                  : 'border-border hover:border-primary/30'
              }`}
              style={{ boxShadow: 'var(--shadow-card)', animationDelay: `${0.2 + i * 0.07}s` }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                a.accent ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
              } transition-colors`}>
                {a.icon}
              </div>
              <span className="text-sm font-semibold text-foreground">{a.label}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">{a.desc}</span>
            </button>
          ))}
        </div>

        {/* Workflow steps */}
        <div
          className="w-full rounded-2xl p-4 animate-[fade-in_0.4s_ease-out_0.5s_both]"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(8px)' }}
        >
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">工作流程</h3>
          <div className="space-y-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5">
                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold font-data shrink-0">{i + 1}</span>
                <span className="text-xs text-muted-foreground leading-relaxed pt-1">{step}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
