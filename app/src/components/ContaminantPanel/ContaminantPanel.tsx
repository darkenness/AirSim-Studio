import { useAppStore } from '../../store/useAppStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Plus, Trash2, FlaskConical, Flame, Clock } from 'lucide-react';

function InputField({ label, value, onChange, unit, type = 'text', step }: {
  label: string; value: string | number; onChange: (v: string) => void; unit?: string; type?: string; step?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">{label}</span>
      <div className="flex items-center gap-1">
        <input type={type} value={value} step={step} onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background" />
        {unit && <span className="text-[10px] text-muted-foreground min-w-[24px]">{unit}</span>}
      </div>
    </label>
  );
}

const POLLUTANT_TEMPLATES: { name: string; molarMass: number; decayRate: number; outdoorConc: number; label: string }[] = [
  { name: 'CO',   molarMass: 0.028, decayRate: 0,      outdoorConc: 0,       label: '一氧化碳' },
  { name: 'CO₂',  molarMass: 0.044, decayRate: 0,      outdoorConc: 7.2e-4,  label: '二氧化碳 (400ppm)' },
  { name: 'HCHO', molarMass: 0.030, decayRate: 1.1e-5, outdoorConc: 0,       label: '甲醛' },
  { name: 'PM2.5',molarMass: 0,     decayRate: 0,      outdoorConc: 3.5e-5,  label: '颗粒物 (35μg/m³)' },
  { name: 'Rn',   molarMass: 0.222, decayRate: 2.1e-6, outdoorConc: 0,       label: '氡' },
];

function SpeciesSection() {
  const { species, addSpecies, removeSpecies, updateSpecies } = useAppStore();

  const handleAdd = () => {
    const nextId = species.length > 0 ? Math.max(...species.map((s) => s.id)) + 1 : 0;
    addSpecies({
      id: nextId,
      name: `污染物 ${nextId}`,
      molarMass: 0.029,
      decayRate: 0,
      outdoorConcentration: 0,
      isTrace: true,
      diffusionCoeff: 0,
      meanDiameter: 0,
      effectiveDensity: 0,
    });
  };

  const handleAddTemplate = (tpl: typeof POLLUTANT_TEMPLATES[0]) => {
    const nextId = species.length > 0 ? Math.max(...species.map((s) => s.id)) + 1 : 0;
    addSpecies({
      id: nextId,
      name: tpl.name,
      molarMass: tpl.molarMass,
      decayRate: tpl.decayRate,
      outdoorConcentration: tpl.outdoorConc,
      isTrace: true,
      diffusionCoeff: 0,
      meanDiameter: tpl.molarMass === 0 ? 2.5e-6 : 0,
      effectiveDensity: tpl.molarMass === 0 ? 1000 : 0,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <FlaskConical size={14} className="text-purple-500" />
        <span className="text-xs font-bold text-foreground">污染物种类</span>
        <button onClick={handleAdd} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-purple-500">
          <Plus size={14} />
        </button>
      </div>

      {/* Quick-add templates */}
      <div className="flex flex-wrap gap-1">
        {POLLUTANT_TEMPLATES.map((tpl) => (
          <button
            key={tpl.name}
            onClick={() => handleAddTemplate(tpl)}
            title={tpl.label}
            className="px-1.5 py-0.5 text-[10px] bg-accent hover:bg-primary/10 text-accent-foreground rounded border border-border transition-colors"
          >
            + {tpl.name}
          </button>
        ))}
      </div>

      {species.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">点击上方按钮快速添加常见污染物，或点击 + 自定义添加。</p>
      )}

      {species.map((sp) => (
        <div key={sp.id} className="border border-border rounded-md p-2 flex flex-col gap-1.5 bg-card">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-purple-500 font-bold">#{sp.id}</span>
            <input value={sp.name} onChange={(e) => updateSpecies(sp.id, { name: e.target.value })}
              className="flex-1 px-1.5 py-0.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <button onClick={() => removeSpecies(sp.id)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <InputField label="摩尔质量" value={sp.molarMass} unit="kg/mol" type="number" step="0.001"
              onChange={(v) => updateSpecies(sp.id, { molarMass: parseFloat(v) || 0.029 })} />
            <InputField label="衰减率" value={sp.decayRate} unit="1/s" type="number" step="0.001"
              onChange={(v) => updateSpecies(sp.id, { decayRate: parseFloat(v) || 0 })} />
          </div>
          <InputField label="室外浓度" value={sp.outdoorConcentration} unit="kg/m³" type="number" step="0.0001"
            onChange={(v) => updateSpecies(sp.id, { outdoorConcentration: parseFloat(v) || 0 })} />
        </div>
      ))}
    </div>
  );
}

function SourceSection() {
  const { sources, addSource, removeSource, updateSource, nodes, species } = useAppStore();
  const canvasStories = useCanvasStore(s => s.stories);

  // Unified room list: merge legacy AppStore nodes + canvas zone assignments
  const legacyRooms = nodes.filter((n) => n.type === 'normal').map(n => ({ id: n.id, name: n.name }));
  const canvasRooms = canvasStories.flatMap(s =>
    s.zoneAssignments.map(z => ({ id: z.zoneId, name: z.name }))
  );
  // Deduplicate by ID, prefer canvas zones
  const roomMap = new Map<number, { id: number; name: string }>();
  for (const r of legacyRooms) roomMap.set(r.id, r);
  for (const r of canvasRooms) roomMap.set(r.id, r);
  const rooms = Array.from(roomMap.values());

  const handleAdd = () => {
    if (rooms.length === 0 || species.length === 0) return;
    addSource({
      zoneId: rooms[0].id,
      speciesId: species[0].id,
      generationRate: 1e-6,
      removalRate: 0,
      scheduleId: -1,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Flame size={14} className="text-orange-500" />
        <span className="text-xs font-bold text-foreground">源/汇</span>
        <button onClick={handleAdd} disabled={rooms.length === 0 || species.length === 0}
          className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-orange-500 disabled:opacity-30">
          <Plus size={14} />
        </button>
      </div>

      {sources.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">
          {species.length === 0 ? '请先添加污染物种类。' : '尚未添加源。点击 + 添加。'}
        </p>
      )}

      {sources.map((src, idx) => {
        const zone = nodes.find((n) => n.id === src.zoneId);
        const sp = species.find((s) => s.id === src.speciesId);
        return (
          <div key={idx} className="border border-border rounded-md p-2 flex flex-col gap-1.5 bg-card">
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-orange-500 font-bold">{zone?.name ?? `#${src.zoneId}`}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-purple-500 font-bold">{sp?.name ?? `#${src.speciesId}`}</span>
              <button onClick={() => removeSource(idx)} className="ml-auto p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <Trash2 size={12} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground">区域</span>
                <select value={src.zoneId} onChange={(e) => updateSource(idx, { zoneId: parseInt(e.target.value) })}
                  className="px-1.5 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background">
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground">污染物</span>
                <select value={src.speciesId} onChange={(e) => updateSource(idx, { speciesId: parseInt(e.target.value) })}
                  className="px-1.5 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background">
                  {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">源类型</span>
              <select value={src.type ?? 'Constant'} onChange={(e) => updateSource(idx, { type: e.target.value as import('../../types').SourceType })}
                className="px-1.5 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background">
                <option value="Constant">恒定源</option>
                <option value="ExponentialDecay">指数衰减源</option>
                <option value="PressureDriven">压力驱动源</option>
                <option value="CutoffConcentration">浓度切断源</option>
                <option value="Burst">爆发式释放源</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <InputField label="生成率" value={src.generationRate} unit="kg/s" type="number" step="1e-7"
                onChange={(v) => updateSource(idx, { generationRate: parseFloat(v) || 0 })} />
              <InputField label="去除率" value={src.removalRate} unit="1/s" type="number" step="0.001"
                onChange={(v) => updateSource(idx, { removalRate: parseFloat(v) || 0 })} />
            </div>
            {src.type === 'ExponentialDecay' && (
              <div className="grid grid-cols-2 gap-1.5">
                <InputField label="时间常数 τ" value={src.decayTimeConstant ?? 3600} unit="s" type="number" step="60"
                  onChange={(v) => updateSource(idx, { decayTimeConstant: parseFloat(v) || 3600 })} />
                <InputField label="倍率" value={src.multiplier ?? 1.0} type="number" step="0.1"
                  onChange={(v) => updateSource(idx, { multiplier: parseFloat(v) || 1.0 })} />
              </div>
            )}
            {src.type === 'PressureDriven' && (
              <InputField label="压力系数" value={src.pressureCoeff ?? 0} unit="kg/(s·Pa)" type="number" step="1e-8"
                onChange={(v) => updateSource(idx, { pressureCoeff: parseFloat(v) || 0 })} />
            )}
            {src.type === 'CutoffConcentration' && (
              <InputField label="切断浓度" value={src.cutoffConc ?? 0} unit="kg/m³" type="number" step="0.0001"
                onChange={(v) => updateSource(idx, { cutoffConc: parseFloat(v) || 0 })} />
            )}
            {src.type === 'Burst' && (
              <div className="grid grid-cols-3 gap-1.5">
                <InputField label="释放总量" value={src.burstMass ?? 0.001} unit="kg" type="number" step="0.0001"
                  onChange={(v) => updateSource(idx, { burstMass: parseFloat(v) || 0.001 })} />
                <InputField label="触发时间" value={src.burstTime ?? 0} unit="s" type="number" step="60"
                  onChange={(v) => updateSource(idx, { burstTime: parseFloat(v) || 0 })} />
                <InputField label="持续时间" value={src.burstDuration ?? 60} unit="s" type="number" step="1"
                  onChange={(v) => updateSource(idx, { burstDuration: parseFloat(v) || 60 })} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransientSection() {
  const { transientConfig, setTransientConfig } = useAppStore();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Clock size={14} className="text-teal-500" />
        <span className="text-xs font-bold text-foreground">瞬态配置</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <InputField label="起始时间" value={transientConfig.startTime} unit="s" type="number" step="60"
          onChange={(v) => setTransientConfig({ startTime: parseFloat(v) || 0 })} />
        <InputField label="结束时间" value={transientConfig.endTime} unit="s" type="number" step="60"
          onChange={(v) => setTransientConfig({ endTime: parseFloat(v) || 3600 })} />
        <InputField label="时间步长" value={transientConfig.timeStep} unit="s" type="number" step="1"
          onChange={(v) => setTransientConfig({ timeStep: parseFloat(v) || 60 })} />
        <InputField label="输出间隔" value={transientConfig.outputInterval} unit="s" type="number" step="60"
          onChange={(v) => setTransientConfig({ outputInterval: parseFloat(v) || 60 })} />
      </div>
    </div>
  );
}

export default function ContaminantPanel() {
  const { species } = useAppStore();

  return (
    <div className="flex flex-col gap-3">
      <SpeciesSection />
      <div className="border-t border-border" />
      <SourceSection />
      {species.length > 0 && (
        <>
          <div className="border-t border-border" />
          <TransientSection />
        </>
      )}
    </div>
  );
}
